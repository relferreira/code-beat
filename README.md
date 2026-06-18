# Code Beat

Code Beat is a GitHub Action that reviews pull requests with OpenRouter, creates inline review comments, and publishes a code quality score from 0 to 5.

The reviewer uses the thermo-nuclear code quality review prompt as its system prompt. It is intentionally strict about maintainability, structural simplification, file-size growth, spaghetti branching, abstraction boundaries, and type contracts.

## Usage

```yaml
name: Code Beat

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]

permissions:
  contents: read
  pull-requests: write
  issues: write

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: relferreira/code-beat@main
        with:
          openrouter-api-key: ${{ secrets.OPENROUTER_API_KEY }}
```

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `openrouter-api-key` | yes | | OpenRouter API key. |
| `model` | no | `deepseek/deepseek-v4-flash` | OpenRouter model name. |
| `review-runs` | no | `2` | Number of independent general PR reviewer agents to run. |
| `code-quality-runs` | no | `2` | Number of independent thermo-nuclear code-quality reviewer agents to run. |
| `github-token` | no | `${{ github.token }}` | Token used to read PR files and create comments. |
| `max-comments` | no | `12` | Maximum number of inline comments to post. |
| `fail-on-score-below` | no | | Optional threshold between 0 and 5. The action fails when the score is below this value. |

## Outputs

| Output | Description |
| --- | --- |
| `score` | Numeric score from 0 to 5. |
| `summary` | Review summary. |
| `inline-comments` | Number of inline comments posted. |

## Development

```bash
npm install
npm test
npm run build
```

The action is bundled into `dist/index.js`; commit that file before tagging a release.
