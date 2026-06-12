import { type Schema } from '../types/index';

const person: Schema = {
  name: 'person',
  description: 'A person contact.',
  folder: 'Entities/People',
  properties: {
    title: { type: 'string', required: true },
    aliases: { type: 'relation-list', schema: 'any' },
    email: { type: 'string' },
    role: { type: 'string' },
  },
  fullPageTemplate: `<entity-page>
  <entity-title></entity-title>
  <entity-field name="email"></entity-field>
  <entity-field name="role"></entity-field>
  <!-- TODO: add related notes -->
</entity-page>`,
  summaryTemplate: `<span slot="title"><entity-title></entity-title></span>`,
  pickerTemplate: `<strong><entity-title></entity-title></strong>`,
};

const meeting: Schema = {
  name: 'meeting',
  description: 'A recurring or one-off meeting.',
  folder: 'Entities/Meetings',
  properties: {
    title: { type: 'string', required: true },
    start: { type: 'datetime' },
    end: { type: 'datetime' },
    attendees: { type: 'relation-list', schema: 'person' },
    agenda: { type: 'text' },
  },
  fullPageTemplate: `<entity-page>
  <entity-title></entity-title>
  <entity-field name="start"></entity-field>
  <entity-field name="end"></entity-field>
  <entity-relation-list name="attendees" schema="person"></entity-relation-list>
  <entity-markdown field="agenda"></entity-markdown>
  <quick-capture></quick-capture>
  <entity-query schema="next-action" where="source=current" sort="created desc"></entity-query>
  <!-- TODO: add related notes -->
</entity-page>`,
  summaryTemplate: `<span slot="title"><entity-title></entity-title></span>`,
  pickerTemplate: `<strong><entity-title></entity-title></strong>`,
};

const capturedNote: Schema = {
  name: 'captured-note',
  description: 'A note captured during a meeting or event.',
  folder: 'Entities/Notes',
  properties: {
    title: { type: 'string' },
    created: { type: 'datetime', required: true },
    source: { type: 'relation', schema: 'any' },
    references: { type: 'relation-list', schema: 'any' },
  },
  fullPageTemplate: `<entity-page>
  <entity-title></entity-title>
  <entity-field name="created"></entity-field>
  <entity-field name="source"></entity-field>
  <!-- TODO: add related notes -->
</entity-page>`,
  summaryTemplate: `<span slot="title"><entity-title></entity-title></span>`,
  pickerTemplate: `<strong><entity-title></entity-title></strong>`,
};

const nextAction: Schema = {
  name: 'next-action',
  description: 'An action item to be completed.',
  folder: 'Entities/Actions',
  properties: {
    title: { type: 'string', required: true },
    created: { type: 'datetime' },
    source: { type: 'relation', schema: 'any' },
    collaborators: { type: 'relation-list', schema: 'person' },
    due: { type: 'date' },
    status: { type: 'enum', options: ['open', 'waiting', 'done', 'canceled'] },
  },
  defaultValues: {
    status: 'open',
  },
  fullPageTemplate: `<entity-page>
  <entity-title></entity-title>
  <entity-field name="status"></entity-field>
  <entity-field name="due"></entity-field>
  <entity-field name="source"></entity-field>
  <entity-relation-list name="collaborators" schema="person"></entity-relation-list>
  <!-- TODO: add related notes -->
</entity-page>`,
  summaryTemplate: `<span slot="title"><entity-title></entity-title></span>`,
  pickerTemplate: `<strong><entity-title></entity-title></strong>`,
};

const decision: Schema = {
  name: 'decision',
  description: 'A decision made.',
  folder: 'Entities/Decisions',
  properties: {
    title: { type: 'string', required: true },
    created: { type: 'datetime' },
    source: { type: 'relation', schema: 'any' },
    references: { type: 'relation-list', schema: 'any' },
    status: {
      type: 'enum',
      options: ['proposed', 'accepted', 'rejected', 'superseded'],
    },
  },
  fullPageTemplate: `<entity-page>
  <entity-title></entity-title>
  <entity-field name="status"></entity-field>
  <entity-field name="source"></entity-field>
  <!-- TODO: add related notes -->
</entity-page>`,
  summaryTemplate: `<span slot="title"><entity-title></entity-title></span>`,
  pickerTemplate: `<strong><entity-title></entity-title></strong>`,
};

const openQuestion: Schema = {
  name: 'open-question',
  description: 'A question that needs an answer.',
  folder: 'Entities/Questions',
  properties: {
    title: { type: 'string', required: true },
    created: { type: 'datetime' },
    source: { type: 'relation', schema: 'any' },
    owner: { type: 'relation', schema: 'person' },
    status: { type: 'enum', options: ['open', 'answered', 'closed'] },
  },
  fullPageTemplate: `<entity-page>
  <entity-title></entity-title>
  <entity-field name="status"></entity-field>
  <entity-field name="owner"></entity-field>
  <entity-field name="source"></entity-field>
  <!-- TODO: add related notes -->
</entity-page>`,
  summaryTemplate: `<span slot="title"><entity-title></entity-title></span>`,
  pickerTemplate: `<strong><entity-title></entity-title></strong>`,
};

export const BUILTIN_SCHEMAS: Schema[] = [
  person,
  meeting,
  capturedNote,
  nextAction,
  decision,
  openQuestion,
];
