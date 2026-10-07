import '../styles/logo.css';

type LogoSize = 'hero' | 'sidebar' | 'header' | 'auth';
type LogoBackground = 'dark' | 'light';

interface LogoProps {
  size?: LogoSize;
  background?: LogoBackground;
}

export default function Logo({ size = 'header', background = 'light' }: LogoProps) {
  return (
    <span className={`portai-logo portai-logo--${size} portai-logo--${background}`} role="img" aria-label="PortAI">
      <img className="portai-logo__mark" src={`${import.meta.env.BASE_URL}portai-mark.svg`} alt="" aria-hidden="true" />
      <span className="portai-logo__wordmark" aria-hidden="true"><span className="portai-logo__port">Port</span><span className="portai-logo__ai">AI</span></span>
    </span>
  );
}
