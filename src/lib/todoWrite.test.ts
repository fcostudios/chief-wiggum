import { describe, expect, it } from 'vitest';
import { normalizeTodoItems, parseTodoWriteInput } from './todoWrite';

describe('todoWrite', () => {
  it('preserves current TodoWrite schema fields', () => {
    expect(
      normalizeTodoItems([
        {
          id: '1',
          content: 'Write tests',
          activeForm: 'Writing tests',
          status: 'in_progress',
        },
      ]),
    ).toEqual([
      {
        id: '1',
        content: 'Write tests',
        activeForm: 'Writing tests',
        status: 'in_progress',
      },
    ]);
  });

  it('fills activeForm from content for legacy TodoWrite payloads', () => {
    expect(
      normalizeTodoItems([
        {
          id: '1',
          content: 'Write tests',
          status: 'in_progress',
        },
      ]),
    ).toEqual([
      {
        id: '1',
        content: 'Write tests',
        activeForm: 'Write tests',
        status: 'in_progress',
      },
    ]);
  });

  it('parses tool_input safely and drops malformed todo items', () => {
    expect(
      parseTodoWriteInput(
        JSON.stringify({
          todos: [
            { content: 'Keep me', status: 'pending' },
            { content: '', status: 'pending' },
            { foo: 'bar' },
          ],
        }),
      ),
    ).toEqual([
      {
        content: 'Keep me',
        activeForm: 'Keep me',
        status: 'pending',
      },
    ]);
  });
});
