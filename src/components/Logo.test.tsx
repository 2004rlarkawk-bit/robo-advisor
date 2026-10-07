import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Logo from './Logo';

describe('PortAI Logo', () => {
  it('uses the shared ship mark and dark-background wordmark', () => {
    const html = renderToStaticMarkup(<Logo size="hero" background="dark" />);
    expect(html).toContain('portai-logo--hero portai-logo--dark');
    expect(html).toContain('portai-mark.svg');
    expect(html).toContain('aria-label="PortAI"');
    expect(html).toContain('>Port</span><span class="portai-logo__ai">AI</span>');
  });

  it('selects the light-background style without changing the icon', () => {
    const html = renderToStaticMarkup(<Logo size="header" background="light" />);
    expect(html).toContain('portai-logo--header portai-logo--light');
    expect(html).toContain('portai-mark.svg');
  });
});
