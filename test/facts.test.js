import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFactMarkdown,
  factAtIndex,
  factPropertiesFromMarkdown,
  factRelationsFromMarkdown,
  factTitleFromMarkdown,
  factTypeFromMarkdown,
  factTextFromMarkdown,
  listContextDirectories,
  listFacts,
  markdownWithContextLinks,
  markdownWithFrontMatterProperty,
  markdownWithRelation,
  markdownWithFactType,
  resolveContextDirectory,
  filenameBaseForTitle,
  saveFact,
  slugifyTitle,
  titleForFactText,
  truncateFilenameBase,
  timestampForFilename,
  updateFactTypeAtIndex
} from '../src/facts.js';

test('builds fact Markdown with the requested front matter', () => {
  assert.equal(
    buildFactMarkdown('The sky is blue.', { type: 'note' }),
    '---\ntitle: "The sky is blue."\ntype: note\n---\n\n\n'
  );
});

test('builds fact Markdown with related contexts', () => {
  assert.equal(
    buildFactMarkdown('The sky is blue.', {
      relations: ['people/alex', 'projects/gatherbrain']
    }),
    '---\ntitle: "The sky is blue."\ntype: fact\nrelatedContexts: ["people/alex", "projects/gatherbrain"]\n---\n\n\n'
  );
});

test('builds fact Markdown with custom properties', () => {
  assert.equal(
    buildFactMarkdown('Pasted 2026-06-25T14-03-04.005-04-00', {
      properties: {
        file: 'pasted-2026-06-25T14-03-04.005-04-00.txt'
      }
    }),
    '---\ntitle: "Pasted 2026-06-25T14-03-04.005-04-00"\ntype: fact\nfile: "pasted-2026-06-25T14-03-04.005-04-00.txt"\n---\n\n\n'
  );
});

test('extracts fact title from Markdown front matter', () => {
  assert.equal(
    factTitleFromMarkdown('---\ntitle: "The sky is blue."\ntype: fact\n---\n\n'),
    'The sky is blue.'
  );
});

test('extracts fact text from Markdown front matter', () => {
  assert.equal(
    factTextFromMarkdown('---\ntype: fact\n---\n\nThe sky is blue.\n'),
    'The sky is blue.'
  );
});

test('extracts fact type from Markdown front matter', () => {
  assert.equal(
    factTypeFromMarkdown('---\ntype: task\n---\n\nThe sky is blue.\n'),
    'task'
  );
});

test('extracts non-reserved front matter properties', () => {
  assert.deepEqual(
    factPropertiesFromMarkdown('---\ntitle: Test\ntype: todo\ndue: 2026-06-24\npriority: "high value"\nrelatedContexts: ["projects/app"]\n---\n\nBody.\n'),
    {
      due: '2026-06-24',
      priority: 'high value'
    }
  );
});

test('extracts related contexts from Markdown front matter', () => {
  assert.deepEqual(
    factRelationsFromMarkdown('---\ntype: fact\nrelatedContexts: ["people/Steve Ma"]\n---\n\nThe sky is blue.\n'),
    ['people/Steve Ma']
  );
});

test('extracts block related contexts from Markdown front matter', () => {
  assert.deepEqual(
    factRelationsFromMarkdown('---\ntype: fact\nrelatedContexts:\n  - people/Steve Ma\n  - projects/gatherbrain\n---\n\n'),
    ['people/Steve Ma', 'projects/gatherbrain']
  );
});

test('deduplicates related contexts', () => {
  assert.deepEqual(
    factRelationsFromMarkdown(
      '---\ntype: fact\nrelatedContexts: ["people/Steve Ma", "people/Steve Ma"]\n---\n\n'
    ),
    ['people/Steve Ma']
  );
});

test('converts context mentions to Markdown links', () => {
  assert.equal(
    markdownWithContextLinks('Talk to @Steve Ma.', {
      contextLinks: [{ folder: 'Steve Ma', name: 'people/Steve Ma' }]
    }),
    'Talk to [Steve Ma](/people/Steve Ma).'
  );
});

test('updates fact type in Markdown front matter', () => {
  assert.equal(
    markdownWithFactType('---\ntype: fact\n---\n\nThe sky is blue.\n', 'task'),
    '---\ntype: task\n---\n\nThe sky is blue.\n'
  );
  assert.equal(
    markdownWithFactType('---\ntype: fact\n---\n\nThe sky is blue.\n', 'in progress'),
    '---\ntype: in progress\n---\n\nThe sky is blue.\n'
  );
});

test('updates Markdown front matter properties', () => {
  assert.equal(
    markdownWithFrontMatterProperty('---\ntitle: Test\n---\n\nBody.\n', 'due', '2026-06-24'),
    '---\ntitle: Test\ndue: 2026-06-24\n---\n\nBody.\n'
  );
  assert.equal(
    markdownWithFrontMatterProperty('---\ntitle: Test\ndue: 2026-06-24\n---\n\nBody.\n', 'due', '2026-07-01'),
    '---\ntitle: Test\ndue: 2026-07-01\n---\n\nBody.\n'
  );
  assert.throws(
    () => markdownWithFrontMatterProperty('---\ntitle: Test\n---\n\nBody.\n', 'bad:property', '2026-06-24'),
    /property must start/
  );
});

test('adds a relation to Markdown front matter', () => {
  assert.equal(
    markdownWithRelation('---\ntype: fact\n---\n\nThe sky is blue.\n', 'people/Steve Ma'),
    '---\ntype: fact\nrelatedContexts: ["people/Steve Ma"]\n---\n\nThe sky is blue.\n'
  );
});

test('appends a relation to Markdown front matter', () => {
  assert.equal(
    markdownWithRelation(
      '---\ntype: fact\nrelatedContexts: ["people/Ada"]\n---\n\nThe sky is blue.\n',
      'people/Steve Ma'
    ),
    '---\ntype: fact\nrelatedContexts: ["people/Ada", "people/Steve Ma"]\n---\n\nThe sky is blue.\n'
  );
});

test('rejects invalid fact types', () => {
  assert.throws(
    () => markdownWithFactType(buildFactMarkdown('The sky is blue.'), 'bad:type'),
    /type must start with a letter/
  );
});

test('formats timestamps as filesystem-safe local time', () => {
  const date = new Date(2026, 5, 23, 9, 4, 7, 12);
  const timestamp = timestampForFilename(date);

  assert.match(
    timestamp,
    /^2026-06-23T09-04-07\.012[+-]\d{2}-\d{2}$/
  );
});

test('slugifies fact titles for filenames', () => {
  assert.equal(slugifyTitle('Captured from the prompt.'), 'captured-from-the-prompt');
});

test('truncates long title slugs for filenames', () => {
  assert.equal(truncateFilenameBase('short-name'), 'short-name');
  assert.equal(filenameBaseForTitle(`${'Long fact '.repeat(40)}tail`).length <= 120, true);
  assert.equal(
    filenameBaseForTitle(`${'Long fact '.repeat(40)}tail`).endsWith('-'),
    false
  );
});

test('saves a fact to a slug-named Markdown file', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-'));

  try {
    const savedPath = await saveFact('Captured from the prompt.', {
      rootDirectory: directory
    });

    assert.equal(path.extname(savedPath), '.md');
    assert.equal(path.basename(savedPath), 'captured-from-the-prompt.md');
    assert.equal(
      await readFile(savedPath, 'utf8'),
      '---\ntitle: "Captured from the prompt."\ntype: fact\n---\n\nCaptured from the prompt.\n'
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('saves a long-titled fact to a truncated slug filename', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-'));
  const title = `${'Long fact '.repeat(40)}tail`;

  try {
    const savedPath = await saveFact(title, {
      rootDirectory: directory
    });

    assert.equal(path.extname(savedPath), '.md');
    assert.equal(path.basename(savedPath).length <= 123, true);
    assert.equal(path.basename(savedPath).endsWith('-.md'), false);
    assert.equal(
      factTitleFromMarkdown(await readFile(savedPath, 'utf8')),
      titleForFactText(title)
    );
    assert.equal(
      factTextFromMarkdown(await readFile(savedPath, 'utf8')),
      title
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('resolves context directories inside the root directory', () => {
  const rootDirectory = path.join(tmpdir(), 'gatherbrain-root');
  const contextDirectory = resolveContextDirectory('my-cool-project', {
    rootDirectory
  });

  assert.equal(contextDirectory, path.join(rootDirectory, 'my-cool-project'));
});

test('rejects context directories outside the root directory', () => {
  const rootDirectory = path.join(tmpdir(), 'gatherbrain-root');

  assert.throws(
    () => resolveContextDirectory('../outside', { rootDirectory }),
    /context must be a folder inside rootDirectory/
  );
});

test('lists facts in a root directory', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-'));

  try {
    await writeFile(
      path.join(directory, '2026-06-23T09-04-07.012-04-00.md'),
      buildFactMarkdown('First fact.')
    );
    await writeFile(
      path.join(directory, '2026-06-23T09-05-07.012-04-00.md'),
      buildFactMarkdown('Second fact.')
    );
    await writeFile(path.join(directory, 'ignored.txt'), 'Not a note.');

    assert.deepEqual(
      await listFacts({ rootDirectory: directory }),
      [
        {
          filename: '2026-06-23T09-04-07.012-04-00.md',
          path: path.join(directory, '2026-06-23T09-04-07.012-04-00.md'),
          title: 'First fact.',
          type: 'fact',
          text: 'First fact.'
        },
        {
          filename: '2026-06-23T09-05-07.012-04-00.md',
          path: path.join(directory, '2026-06-23T09-05-07.012-04-00.md'),
          title: 'Second fact.',
          type: 'fact',
          text: 'Second fact.'
        }
      ]
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('lists facts in nested root directories', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-'));

  try {
    await mkdir(path.join(directory, 'project'), { recursive: true });
    await writeFile(
      path.join(directory, '2026-06-23T09-05-07.012-04-00.md'),
      buildFactMarkdown('Second fact.')
    );
    await writeFile(
      path.join(directory, 'project', '2026-06-23T09-04-07.012-04-00.md'),
      buildFactMarkdown('First fact.')
    );

    assert.deepEqual(
      (await listFacts({ rootDirectory: directory })).map((fact) => ({
        filename: fact.filename,
        text: fact.text
      })),
      [
        {
          filename: path.join('project', '2026-06-23T09-04-07.012-04-00.md'),
          text: 'First fact.'
        },
        {
          filename: '2026-06-23T09-05-07.012-04-00.md',
          text: 'Second fact.'
        }
      ]
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('ignores Markdown files and contexts in hidden directories', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-'));

  try {
    await mkdir(path.join(directory, '.trash'), { recursive: true });
    await mkdir(path.join(directory, '.gatherbrain'), { recursive: true });
    await mkdir(path.join(directory, '.hidden', 'deep'), { recursive: true });
    await mkdir(path.join(directory, 'project'), { recursive: true });
    await writeFile(path.join(directory, '.trash', 'trashed.md'), buildFactMarkdown('Trashed fact.'));
    await writeFile(path.join(directory, '.hidden', 'hidden.md'), buildFactMarkdown('Hidden fact.'));
    await writeFile(path.join(directory, 'project', 'visible.md'), buildFactMarkdown('Visible fact.'));

    assert.deepEqual(
      (await listFacts({ rootDirectory: directory })).map((fact) => fact.filename),
      [path.join('project', 'visible.md')]
    );
    assert.deepEqual(
      await listContextDirectories({ rootDirectory: directory }),
      ['project']
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('lists related contexts', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-'));

  try {
    await writeFile(
      path.join(directory, '2026-06-23T09-04-07.012-04-00.md'),
      '---\ntype: fact\nrelatedContexts: ["people/Steve Ma"]\n---\n\nFirst fact.\n'
    );

    assert.deepEqual(
      (await listFacts({ rootDirectory: directory })).map((fact) => fact.relations),
      [['people/Steve Ma']]
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('ignores Markdown body links as relationships', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-'));

  try {
    await writeFile(
      path.join(directory, '2026-06-23T09-04-07.012-04-00.md'),
      '---\ntype: fact\n---\n\nTalk to [Steve Ma](/people/Steve Ma).\n'
    );

    assert.deepEqual(
      (await listFacts({ rootDirectory: directory })).map((fact) => fact.relations),
      [undefined]
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('updates a fact type by one-based index', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-'));
  const targetPath = path.join(directory, '2026-06-23T09-05-07.012-04-00.md');

  try {
    await writeFile(
      path.join(directory, '2026-06-23T09-04-07.012-04-00.md'),
      buildFactMarkdown('First fact.')
    );
    await writeFile(targetPath, buildFactMarkdown('Second fact.'));

    assert.equal(
      (await updateFactTypeAtIndex({
        index: 2,
        rootDirectory: directory,
        type: 'task'
      })).type,
      'task'
    );
    assert.equal(
      await readFile(targetPath, 'utf8'),
      '---\ntitle: "Second fact."\ntype: task\n---\n\n\n'
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('gets a fact by one-based index', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-'));

  try {
    await writeFile(
      path.join(directory, '2026-06-23T09-04-07.012-04-00.md'),
      buildFactMarkdown('First fact.')
    );
    await writeFile(
      path.join(directory, '2026-06-23T09-05-07.012-04-00.md'),
      buildFactMarkdown('Second fact.')
    );

    assert.equal(
      (await factAtIndex({
        index: 2,
        rootDirectory: directory
      })).text,
      'Second fact.'
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('lists context directories recursively', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'gatherbrain-'));

  try {
    await mkdir(path.join(directory, 'alpha', 'deep'), { recursive: true });
    await mkdir(path.join(directory, 'beta'), { recursive: true });
    await writeFile(path.join(directory, '2026-06-23T09-04-07.012-04-00.md'), 'A note.');

    assert.deepEqual(
      await listContextDirectories({ rootDirectory: directory }),
      [
        'alpha',
        'alpha/deep',
        'beta'
      ]
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
