import { describe, expect, it } from 'vitest';
import { fireEvent, render } from '@solidjs/testing-library';
import { LiveToolOutput } from './LiveToolOutput';

describe('LiveToolOutput (CHI-188)', () => {
  it('renders output content', () => {
    const { getByText } = render(() => (
      <LiveToolOutput content="hello world" toolName="Bash" isError={false} />
    ));
    expect(getByText('hello world')).toBeInTheDocument();
  });

  it('shows tool name in header', () => {
    const { getAllByText } = render(() => (
      <LiveToolOutput content="output" toolName="Bash" isError={false} />
    ));
    expect(getAllByText('Bash').length).toBeGreaterThan(0);
  });

  it('collapses and expands on header click', () => {
    const { getByLabelText, queryByLabelText } = render(() => (
      <LiveToolOutput content="some output" toolName="Bash" isError={false} />
    ));
    expect(queryByLabelText('Bash execution output')).toBeInTheDocument();
    fireEvent.click(getByLabelText('Collapse Bash output'));
    expect(queryByLabelText('Bash execution output')).not.toBeInTheDocument();
    fireEvent.click(getByLabelText('Expand Bash output'));
    expect(queryByLabelText('Bash execution output')).toBeInTheDocument();
  });

  it('shows green exit badge for exit code 0', () => {
    const { getByText } = render(() => (
      <LiveToolOutput content={'Exit code 0\noutput'} toolName="Bash" isError={false} />
    ));
    expect(getByText('exit 0')).toBeInTheDocument();
  });

  it('shows red exit badge for non-zero exit code when isError', () => {
    const { getByText } = render(() => (
      <LiveToolOutput content={'Exit code 1\nerror output'} toolName="Bash" isError={true} />
    ));
    expect(getByText('exit 1')).toBeInTheDocument();
  });

  it('shows no exit badge when content has no exit code pattern', () => {
    const { queryByText } = render(() => (
      <LiveToolOutput content="just some output" toolName="Bash" isError={false} />
    ));
    expect(queryByText(/^exit/)).not.toBeInTheDocument();
  });

  it('applies error border color when isError is true', () => {
    const { container } = render(() => (
      <LiveToolOutput content="error" toolName="Bash" isError={true} />
    ));
    const outer = container.firstElementChild as HTMLElement;
    expect(outer?.style.border).toContain('color-tool-permission-deny');
  });

  it('aria-label on output pre includes tool name', () => {
    const { getByLabelText } = render(() => (
      <LiveToolOutput content="content" toolName="Read" isError={false} />
    ));
    expect(getByLabelText('Read execution output')).toBeInTheDocument();
  });
});
