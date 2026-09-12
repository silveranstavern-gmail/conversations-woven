import { readTextAttachments } from './text-attachments';

describe('text attachment import', () => {
  it('preserves text, order, and nested Markdown fences', async () => {
    const content = await readTextAttachments([
      new File(['```js\nconst x = 1;\n```'], 'notes.md'),
      new File(['hello'], 'second.TXT'),
    ]);
    expect(content).toContain('````text\n```js\nconst x = 1;\n```\n````');
    expect(content.indexOf('notes.md')).toBeLessThan(content.indexOf('second.TXT'));
  });

  it('rejects a whole batch before reading unsupported files', async () => {
    const file = new File(['hello'], 'notes.md');
    const read = spyOn(file, 'arrayBuffer').and.callThrough();
    await expectAsync(
      readTextAttachments([file, new File(['binary'], 'photo.png')]),
    ).toBeRejectedWithError(/\.md or \.txt/);
    expect(read).not.toHaveBeenCalled();
  });

  it('rejects binary, invalid UTF-8, empty, and oversized input', async () => {
    await expectAsync(readTextAttachments([new File(['\0'], 'bad.txt')])).toBeRejectedWithError(
      /binary/,
    );
    await expectAsync(
      readTextAttachments([new File([new Uint8Array([255])], 'bad.txt')]),
    ).toBeRejectedWithError(/UTF-8/);
    await expectAsync(readTextAttachments([new File(['  '], 'empty.txt')])).toBeRejectedWithError(
      /empty/,
    );
    await expectAsync(
      readTextAttachments([new File([new Uint8Array(262145)], 'large.txt')]),
    ).toBeRejectedWithError(/256 KB/);
  });
});
