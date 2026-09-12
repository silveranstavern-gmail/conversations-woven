const MAX_FILE_BYTES = 256 * 1024;
const MAX_BATCH_BYTES = 512 * 1024;

/** Import as editable text so sending, context estimates, backups, and export agree. */
export async function readTextAttachments(files: readonly File[]): Promise<string> {
  if (files.length > 10 || files.reduce((sum, file) => sum + file.size, 0) > MAX_BATCH_BYTES) {
    throw new Error('Attach up to 10 files and 512 KB at a time.');
  }
  for (const file of files) {
    if (!/\.(md|txt)$/i.test(file.name))
      throw new Error(`${file.name}: choose a .md or .txt file.`);
    if (file.size > MAX_FILE_BYTES)
      throw new Error(`${file.name}: files must be 256 KB or smaller.`);
  }
  const sections = await Promise.all(
    files.map(async (file) => {
      let text: string;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      } catch {
        throw new Error(`${file.name}: could not read UTF-8 text.`);
      }
      if (text.includes('\0'))
        throw new Error(`${file.name}: binary files cannot be included as text.`);
      if (!text.trim()) throw new Error(`${file.name}: the file is empty.`);
      // A longer fence keeps embedded Markdown fences inside the attachment.
      const longest = (text.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 2);
      const fence = '`'.repeat(longest + 1);
      const name = file.name.replace(/[\r\n]/g, ' ').replace(/[\\`*_{}\[\]<>#]/g, '\\$&');
      return `Attached file: ${name}\n\n${fence}text\n${text}\n${fence}`;
    }),
  );
  return sections.join('\n\n');
}
