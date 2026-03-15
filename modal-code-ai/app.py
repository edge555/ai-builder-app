import json
import logging

import modal
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("modal-code-ai")

app = modal.App("ai-code-builder")

volume = modal.Volume.from_name("model-cache", create_if_missing=True)

image = (
    modal.Image.debian_slim()
    .pip_install(
        "torch==2.5.1",
        "transformers==4.47.1",
        "accelerate==1.2.1",
        "bitsandbytes==0.45.0",
        "fastapi[standard]==0.115.6",
        "pydantic==2.10.3",
    )
)

MAX_TOKENS_LIMIT = 16384
MIN_TOKENS = 1
MAX_TEMPERATURE = 2.0


class GenerateRequest(BaseModel):
    prompt: str
    system_instruction: str = ""
    temperature: float = 0.7
    max_tokens: int = 1024
    response_format: str = "text"   # "text" | "json_object"


def _validate_request(request: GenerateRequest) -> None:
    if not (MIN_TOKENS <= request.max_tokens <= MAX_TOKENS_LIMIT):
        raise ValueError(f"max_tokens must be {MIN_TOKENS}-{MAX_TOKENS_LIMIT}, got {request.max_tokens}")
    if not (0.0 <= request.temperature <= MAX_TEMPERATURE):
        raise ValueError(f"temperature must be 0.0-{MAX_TEMPERATURE}, got {request.temperature}")


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

        # trust_remote_code=True is required by Qwen models: they ship custom
        # modeling code (e.g. RoPE scaling, attention variants) that is not yet
        # merged into the transformers library. Without this flag the model
        # refuses to load. Only enable for trusted, pinned model revisions.
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
        logger.info("Model loaded: %s", model_name)

    @modal.method()
    def generate(self, request: GenerateRequest) -> dict:
        _validate_request(request)

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

        do_sample = request.temperature > 0
        generation_kwargs = {
            **inputs,
            "max_new_tokens": request.max_tokens,
            "do_sample": do_sample,
        }
        if do_sample:
            generation_kwargs["temperature"] = request.temperature
            generation_kwargs["top_p"] = 0.9

        try:
            logger.info("generate(): input_tokens=%d max_new_tokens=%d temperature=%f",
                        input_token_count, request.max_tokens, request.temperature)
            outputs = self.model.generate(**generation_kwargs)
        except Exception as exc:
            logger.exception("Model inference failed in generate()")
            raise RuntimeError(f"Model inference failed: {exc}") from exc

        generated_tokens = outputs[0][input_token_count:]
        content = self.tokenizer.decode(generated_tokens, skip_special_tokens=True)

        return {"content": content, "model": self.model_name}

    @modal.method(is_generator=True)
    def generate_stream(self, request: GenerateRequest):
        from threading import Thread
        from transformers import TextIteratorStreamer

        _validate_request(request)

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

        do_sample = request.temperature > 0
        generation_kwargs = {
            **inputs,
            "max_new_tokens": request.max_tokens,
            "do_sample": do_sample,
            "streamer": streamer,
        }
        if do_sample:
            generation_kwargs["temperature"] = request.temperature
            generation_kwargs["top_p"] = 0.9

        inference_error: list[Exception] = []

        def _run_generation():
            try:
                self.model.generate(**generation_kwargs)
            except Exception as exc:
                logger.exception("Model inference failed in generate_stream()")
                inference_error.append(exc)
                streamer.end()

        logger.info("generate_stream(): max_new_tokens=%d temperature=%f",
                    request.max_tokens, request.temperature)
        thread = Thread(target=_run_generation)
        thread.start()

        try:
            for token in streamer:
                if token:
                    yield token
        finally:
            thread.join()

        if inference_error:
            raise RuntimeError(f"Model inference failed: {inference_error[0]}") from inference_error[0]


@app.function(image=image)
@modal.fastapi_endpoint(method="POST")
def generate_api(request: GenerateRequest):
    return CodeGenerator().generate.remote(request)


@app.function(image=image)
@modal.fastapi_endpoint(method="POST")
async def generate_stream_api(request: GenerateRequest):
    import time
    from starlette.responses import StreamingResponse

    async def event_stream():
        for token in CodeGenerator().generate_stream.remote_gen(request):
            timestamp = time.time()
            yield f"data: {json.dumps({'token': token, 'timestamp': timestamp})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
            "X-Content-Type-Options": "nosniff",
        },
    )
