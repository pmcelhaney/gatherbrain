# Development Notes

Gatherbrain is a Node.js application. It requires Node.js 20 or newer and has
no external npm dependencies.

## Verify Changes

Run the full test suite before committing a change:

```bash
npm test
```

For a non-interactive smoke render of the terminal screen:

```bash
npm start -- --render-once
```

The project uses deterministic automated tests as guardrails for an
AI-assisted development process.

## Contributor Workflow

Keep changes small and focused. Update the living
[interaction specification](spec.md) whenever a product or architecture
decision changes. Project conventions are maintained in [AGENTS.md](../AGENTS.md).
