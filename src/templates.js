import { existsSync, readFileSync } from 'node:fs';
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
const workspaceTemplateDirectory = path.join('.gatherbrain', 'templates');
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

function validateTemplateName(name) {
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/u.test(name)) {
    throw new Error(`unsupported template ${name}`);
  }
}

function templatePathForName(name, rootDirectory = null) {
  validateTemplateName(name);

  if (rootDirectory) {
    const localTemplatePath = path.join(rootDirectory, workspaceTemplateDirectory, `${name}.hbs`);

    if (existsSync(localTemplatePath)) {
      return localTemplatePath;
    }
  }

  return path.join(defaultTemplateDirectory, `${name}.hbs`);
}

function compiledTemplate(name, options = {}) {
  const { rootDirectory = null } = options;
  const templatePath = templatePathForName(name, rootDirectory);

  if (compiledTemplates.has(templatePath)) {
    return compiledTemplates.get(templatePath);
  }

  const template = Handlebars.compile(
    transformFilterSyntax(readFileSync(templatePath, 'utf8')),
    {
      noEscape: true,
      strict: true
    }
  );

  compiledTemplates.set(templatePath, template);
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

export function renderTemplate(name, viewModel, options = {}) {
  return compiledTemplate(name, options)(viewModel).replace(/\r?\n$/u, '');
}

export function renderTemplateLines(name, viewModel, options = {}) {
  const rendered = renderTemplate(name, viewModel, options);

  return rendered.length > 0 ? rendered.split(/\r?\n/u) : [];
}

export function clearTemplateCache(options = {}) {
  const { rootDirectory = null } = options;

  if (!rootDirectory) {
    compiledTemplates.clear();
    return;
  }

  const localTemplateRoot = path.join(rootDirectory, workspaceTemplateDirectory);

  for (const templatePath of compiledTemplates.keys()) {
    const relativeTemplatePath = path.relative(localTemplateRoot, templatePath);

    if (
      relativeTemplatePath.length === 0
      || (
        !relativeTemplatePath.startsWith(`..${path.sep}`)
        && relativeTemplatePath !== '..'
        && !path.isAbsolute(relativeTemplatePath)
      )
    ) {
      compiledTemplates.delete(templatePath);
    }
  }
}
