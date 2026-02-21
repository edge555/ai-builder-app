import json

import modal
from pydantic import BaseModel

app = modal.App("ai-code-builder")

volume = modal.Volume.from_name("model-cache", create_if_missing=True)

image = (
    modal.Image.debian_slim()
    .pip_install(
        "torch",
        "transformers",
        "accelerate",
        "bitsandbytes",
        "fastapi[standard]",
        "pydantic",
    )
)


class GenerateRequest(BaseModel):
    prompt: str
    system_instruction: str = ""
    temperature: float = 0.7
    max_tokens: int = 1024
    response_format: str = "text"   # "text" | "json_object"


@app.cls(
    image=image,
    gpu="T4",
    volumes={"/root/.cache/huggingface": volume},
    timeout=600,
    scaledown_window=60,
)
class CodeGenerator:
    @modal.enter()
    def load_model(self):
        from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig

        model_name = "Qwen/Qwen2.5-Coder-7B-Instruct"
        bnb_config = BitsAndBytesConfig(load_in_4bit=True)

        self.tokenizer = AutoTokenizer.from_pretrained(
            model_name,
            trust_remote_code=True,
        )
        self.model = AutoModelForCausalLM.from_pretrained(
            model_name,
            device_map="auto",
            quantization_config=bnb_config,
            trust_remote_code=True,
        )
        self.model_name = model_name

    @modal.method()
    def generate(self, request: GenerateRequest) -> dict:
        system = request.system_instruction
        if request.response_format == "json_object":
            system += "\n\nCRITICAL: Respond with valid JSON only. No markdown, no explanation. Start with '{' and end with '}'."

        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": request.prompt})

        formatted_prompt = self.tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
        )

        inputs = self.tokenizer(formatted_prompt, return_tensors="pt").to("cuda")
        input_token_count = inputs["input_ids"].shape[1]

        outputs = self.model.generate(
            **inputs,
            max_new_tokens=request.max_tokens,
            temperature=request.temperature,
            top_p=0.9,
            do_sample=True,
        )

        generated_tokens = outputs[0][input_token_count:]
        content = self.tokenizer.decode(generated_tokens, skip_special_tokens=True)

        return {"content": content, "model": self.model_name}

    @modal.method(is_generator=True)
    def generate_stream(self, request: GenerateRequest):
        from threading import Thread
        from transformers import TextIteratorStreamer

        system = request.system_instruction
        if request.response_format == "json_object":
            system += "\n\nCRITICAL: Respond with valid JSON only. No markdown, no explanation. Start with '{' and end with '}'."

        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": request.prompt})

        formatted_prompt = self.tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
        )

        inputs = self.tokenizer(formatted_prompt, return_tensors="pt").to("cuda")

        streamer = TextIteratorStreamer(
            self.tokenizer,
            skip_prompt=True,
            skip_special_tokens=True,
        )

        generation_kwargs = {
            **inputs,
            "max_new_tokens": request.max_tokens,
            "temperature": request.temperature,
            "top_p": 0.9,
            "do_sample": True,
            "streamer": streamer,
        }

        thread = Thread(target=self.model.generate, kwargs=generation_kwargs)
        thread.start()

        for token in streamer:
            if token:
                yield token

        thread.join()


@app.function(image=image)
@modal.fastapi_endpoint(method="POST")
def generate_api(request: GenerateRequest):
    return CodeGenerator().generate.remote(request)


@app.function(image=image)
@modal.fastapi_endpoint(method="POST")
def generate_stream_api(request: GenerateRequest):
    from starlette.responses import StreamingResponse

    def event_stream():
        for token in CodeGenerator().generate_stream.remote_gen(request):
            yield f"data: {json.dumps({'token': token})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
