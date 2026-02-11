import './KeyboardHint.css';

interface KeyboardHintProps {
  keys: string[];
  label?: string;
}

export function KeyboardHint({ keys, label }: KeyboardHintProps) {
  return (
    <span className="keyboard-hint" title={label}>
      {keys.map((key, index) => (
        <span key={index}>
          <kbd className="keyboard-hint-key">{key}</kbd>
          {index < keys.length - 1 && <span className="keyboard-hint-separator">+</span>}
        </span>
      ))}
    </span>
  );
}

export default KeyboardHint;
