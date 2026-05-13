---
title: "The Python Toolchain I Use in Production: uv, ruff, and ty"
date: 2026-05-12
description: "Why I replaced pip, black, flake8, and mypy with a single stack from Astral, and how I integrate it in CI/CD with GitHub Actions."
tags: ["python", "tooling", "devops"]
draft: false
pinned: true
---

54x. That's how much faster `uv` installs dependencies compared to `pip` in my production project. Not a synthetic benchmark, my actual project, 74 packages, measured today.

```
uv sync   → 190ms
pip install → 10.393s
```

That's the short version. Here's the long one.

---

**Who is Astral and why should you care**

Before getting into the tools, it's worth knowing who's building them. Astral is the company behind `ruff`, `uv`, and `ty`, three tools that are quietly replacing the Python toolchain most developers have been using for years. Everything they build is written in Rust, which is why the performance numbers look the way they do. They're not just incrementally faster, they're in a different category.

I found out about them the same way most people do: I kept seeing serious open source projects and AI tools using `uv`, didn't know what it was, and went to investigate. I looked at the benchmarks, read about who was building it, and decided to try it. It wasn't hype. The tools do what they say.

---

**uv: the package manager you didn't know you needed**

If you're still using `pip` + `requirements.txt`, you're not doing anything wrong, but you're leaving a lot on the table.

`uv` is a Python package manager and project tool written in Rust. It replaces `pip`, `pip-tools`, `virtualenv`, and partially `poetry`. The speed difference is real:

```
# 74 packages, warm cache
uv sync        →  190ms
pip install    →  10.393s
```

But speed isn't the only reason I switched. The bigger reason is `pyproject.toml`.

`requirements.txt` works, but it's a flat list with no structure. `pyproject.toml` lets you separate production dependencies from development dependencies, pin your Python version, and configure every tool in one place. It's the difference between a config file and a config system.

```toml
[project]
name = "my-project"
version = "0.1.0"
requires-python = ">=3.12,<3.13"
dependencies = [
  "fastapi[standard]>=0.135.1",
  "pydantic>=2.0.0",
  "pydantic-settings>=2.0.0",
  "structlog>=25.5.0",
  "uvicorn[standard]>=0.30.0",
]

[dependency-groups]
dev = [
  "pytest>=8.0.0",
  "pytest-asyncio>=0.24.0",
  "ruff>=0.8.0",
  "ty==0.0.35",
  "pytest-cov>=7.1.0",
]
```

`[dependency-groups]` means your CI installs everything, your production Docker image installs only what it needs:

```bash
uv sync          # everything including dev
uv sync --no-dev # production only
```

A few commands worth knowing:

```bash
uv add package-name        # add production dependency
uv add --dev package-name  # add dev dependency
uv remove package-name     # remove dependency
uv sync                    # install everything from lockfile
uv run pytest              # run any command in the project environment
```

`uv run` is particularly useful, you don't need to activate the virtual environment manually. Just prefix any command with `uv run` and it handles the rest.

One important note: never use `pip` in a `uv` project. `uv` manages a lockfile (`uv.lock`) that should always be committed. Using `pip` directly bypasses it and breaks reproducibility.

---

**ruff: one tool instead of four**

Most Python projects use a combination of `black` for formatting, `flake8` for linting, `isort` for import sorting, and maybe `pyupgrade` for syntax upgrades. That's four tools to configure, four tools to run, four tools to keep in sync.

`ruff` replaces all of them. It's a linter and formatter written in Rust, and it's not incrementally faster than the alternatives, it's in a completely different tier:

```
ruff check  →  31ms
ruff format →  29ms
```

For comparison, `black` on the same codebase typically takes 1-3 seconds. `flake8` similar. `ruff` does both in under 60ms total.

But the speed is almost secondary. What I actually use `ruff` for is the `--fix` flag:

```bash
uv run ruff check . --fix
```

It doesn't just tell you what's wrong, it fixes it. Unused imports removed, syntax upgraded to modern Python, import order corrected, all automatically. No other tool I'd used before did this reliably and at this speed.

Here's how I configure it:

```toml
[tool.ruff]
target-version = "py312"
line-length = 99

[tool.ruff.lint]
select = [
    "E",   # pycodestyle errors
    "F",   # pyflakes
    "I",   # isort
    "UP",  # pyupgrade — modernizes Python syntax automatically
    "B",   # flake8-bugbear — catches common bugs
    "S",   # flake8-bandit — security checks
    "T20", # flake8-print — catches print() statements
]

[tool.ruff.lint.per-file-ignores]
"tests/*" = ["S101", "S106", "S108", "S105"]  # allow assert and hardcoded values in tests
"scripts/*" = ["T201", "T203"]                 # allow print() in scripts
```

A few notes on the rule selection:

`UP` is one of the most useful, it automatically upgrades old Python syntax to modern equivalents. `Union[X, Y]` becomes `X | Y`, `Optional[X]` becomes `X | None`, and so on. You write it once and forget about it.

`S` runs security checks via bandit rules. It catches things like hardcoded passwords, use of `subprocess` with shell injection risk, and unsafe random number generation. Worth having on by default.

`T20` flags `print()` statements. In production code you should be using structured logging, not print. Having ruff catch it automatically means it never slips through to a commit.

The `per-file-ignores` section is important, you don't want `S101` flagged in your tests, and you don't want `T201` flagged in utility scripts where it makes sense.

---

**ty: type checking that doesn't make you want to give up**

`ty` is Astral's type checker, also written in Rust. It's designed to be a modern alternative to `mypy` and `pyright`.

I'd tried both before and neither stuck. `mypy` is slow and its error messages often send you down rabbit holes. `pyright` is better but still feels heavy. `ty` is different, it's fast, its errors are clear, and it integrates naturally with the rest of the Astral stack.

```bash
uv run ty check app/
```

It's currently in beta (`ty==0.0.35` at the time of writing), which I know sounds like a reason to wait. I'd say the opposite, I've been running it in production CI for months without a single false positive or crash. It's beta in version number, not in stability.

Configuration in `pyproject.toml` is minimal:

```toml
[tool.ty.src]
# point to your source directories if needed
```

---

**Putting it all together: CI/CD with GitHub Actions**

The real value of this stack is how cleanly it integrates. Everything runs through `uv run`, everything is configured in `pyproject.toml`, and the GitHub Actions setup is straightforward.

Here's my full pipeline:

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v3
      - run: uv sync --group dev
      - run: uv run ruff check app/
      - name: Format
        run: uv run ruff format app/
      - name: Commit formatting changes
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git diff --quiet && git diff --staged --quiet || \
            (git add -A && git commit -m "style: auto-format with ruff" && git push)
      - run: uv run ty check app/

  test:
    needs: lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v3
      - run: uv sync --group dev
      - run: uv run pytest tests/

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ secrets.AWS_REGION }}
      - name: Login to ECR
        uses: aws-actions/amazon-ecr-login@v2
      - name: Build and push image
        run: |
          docker build -t ${{ secrets.ECR_REGISTRY }}/my-app:latest .
          docker push ${{ secrets.ECR_REGISTRY }}/my-app:latest
      - name: Deploy to ECS
        run: |
          aws ecs update-service \
            --cluster ${{ secrets.ECS_CLUSTER }} \
            --service ${{ secrets.ECS_SERVICE }} \
            --force-new-deployment
```

A few things worth explaining:

**The order is intentional.** `lint` runs first, then `test`, then `deploy`. If ruff or ty catches something, the tests never run and the deploy never happens. Fast feedback, no wasted compute.

**Auto-format in CI.** The lint job doesn't just check formatting, it applies it and commits the result automatically. This means formatting is never a blocker. A developer pushes code, ruff formats it, the commit goes back to the branch. No failed pipelines because someone forgot to run the formatter locally.

**`astral-sh/setup-uv@v3`** — Astral provides an official GitHub Action to install uv. Use it instead of installing manually. It handles caching and always installs the latest stable version.

**Pre-commit checklist before every commit:**

```bash
uv run ruff check . --fix
uv run ruff format .
uv run ty check .
uv run pytest
```

In that order. Fix and format first, then type check, then tests. If all four pass, you're good to push.

---

**The full picture**

Before this stack I was using `pip` + `requirements.txt` + `black` + `flake8` + `mypy`. Five separate tools with five separate configs, slow feedback, and constant friction.

Now it's `uv` + `ruff` + `ty`. Three tools, one config file, feedback in milliseconds.

The numbers:

```
Dependency install  pip → 10.393s   uv  → 190ms    (54x faster)
Linting             flake8 → ~2s    ruff → 31ms    (~65x faster)
Formatting          black → ~1.5s   ruff → 29ms    (~50x faster)
```

If you're starting a new Python project, there's no reason not to use this stack. If you're on an existing project, migrating is straightforward, `uv init`, move your dependencies to `pyproject.toml`, replace your CI steps.

---

**If you want to use these conventions with an LLM**

The conventions from this post and my previous one on FastAPI architecture are both included in a `SKILL.md` you can drop into any LLM context.

→ [fastapi-production-rules](https://github.com/17tayyy/fastapi-production-rules)
