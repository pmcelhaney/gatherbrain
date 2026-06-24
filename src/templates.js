import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Handlebars from 'handlebars';

const defaultTemplateDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'default-config',
  'templates'
);

const compiledTemplates = new Map();
const colorCodes = new Map([
  ['blue', '\x1b[34m'],
  ['cyan', '\x1b[36m'],
  ['magenta', '\x1b[35m']
]);
const ansiResetColor = '\x1b[39m';

Handlebars.registerHelper('color', (value, colorName, options) => {
  if (!options.data.root.includeColor) {
    return value;
  }

  const colorCode = colorCodes.get(colorName);

  return colorCode ? `${colorCode}${value}${ansiResetColor}` : value;
});

function templatePathForName(name) {
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/u.test(name)) {
    throw new Error(`unsupported template ${name}`);
  }

  return path.join(defaultTemplateDirectory, `${name}.hbs`);
}

function compiledTemplate(name) {
  if (compiledTemplates.has(name)) {
    return compiledTemplates.get(name);
  }

  const template = Handlebars.compile(
    transformFilterSyntax(readFileSync(templatePathForName(name), 'utf8')),
    {
      noEscape: true,
      strict: true
    }
  );

  compiledTemplates.set(name, template);
  return template;
}

function transformFilterSyntax(template) {
  return template.replace(
    /\{\{\s*(?<value>[A-Za-z0-9_.-]+)\s*\|\s*(?<filter>[A-Za-z][A-Za-z0-9_-]*)\s*:\s*"(?<argument>[^"]+)"\s*\}\}/gu,
    (_match, _value, _filter, _argument, _offset, _template, groups) => (
      `{{${groups.filter} ${groups.value} "${groups.argument}"}}`
    )
  );
}

export function renderTemplate(name, viewModel) {
  return compiledTemplate(name)(viewModel).replace(/\r?\n$/u, '');
}

export function renderTemplateLines(name, viewModel) {
  const rendered = renderTemplate(name, viewModel);

  return rendered.length > 0 ? rendered.split(/\r?\n/u) : [];
}
