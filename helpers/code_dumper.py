# the purpose of this script should be concatinating all of my script into one file
# --> for the sole purpose of providing that single file to any external LLM for reviews or advice 


#!/usr/bin/env python3
"""
llm_concat.py — Bundle a codebase into a single file for pasting into an LLM.

Quick start:
    python llm_concat.py                    # scan current directory -> llm_dump.md
    python llm_concat.py ./myproject -i      # interactively pick which files to include
    python llm_concat.py -e py,js -x "tests/*" --clipboard

Works with zero dependencies. Install these for a nicer experience:
    pip install rich questionary pyperclip pathspec

Run `python llm_concat.py --help` for all options.
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

# ---------------------------------------------------------------------------
# Optional dependencies — the script degrades gracefully without them.
# ---------------------------------------------------------------------------
try:
    from rich.console import Console
    from rich.table import Table
    from rich.panel import Panel
    from rich.progress import track
    HAS_RICH = True
    console = Console()
except ImportError:
    HAS_RICH = False
    console = None

try:
    import questionary
    HAS_QUESTIONARY = True
except ImportError:
    HAS_QUESTIONARY = False

try:
    import pyperclip
    HAS_CLIPBOARD = True
except ImportError:
    HAS_CLIPBOARD = False

try:
    import pathspec
    HAS_PATHSPEC = True
except ImportError:
    HAS_PATHSPEC = False


CONFIG_FILE = ".llm_concat_config.json"

DEFAULT_EXCLUDE_DIRS = {
    ".git", ".hg", ".svn", "__pycache__", "node_modules", ".venv", "venv",
    "env", ".idea", ".vscode", "dist", "build", ".pytest_cache", ".mypy_cache",
    ".tox", "target", ".next", ".turbo", "coverage", ".ruff_cache", "vendor",
}

DEFAULT_EXCLUDE_FILES = {
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock",
    "Cargo.lock", ".DS_Store",
}

LANG_MAP = {
    ".py": "python", ".js": "javascript", ".jsx": "jsx", ".ts": "typescript",
    ".tsx": "tsx", ".java": "java", ".c": "c", ".h": "c", ".cpp": "cpp",
    ".hpp": "cpp", ".cs": "csharp", ".go": "go", ".rs": "rust", ".rb": "ruby",
    ".php": "php", ".sh": "bash", ".bash": "bash", ".sql": "sql",
    ".html": "html", ".css": "css", ".scss": "scss", ".json": "json",
    ".yaml": "yaml", ".yml": "yaml", ".toml": "toml", ".md": "markdown",
    ".xml": "xml", ".kt": "kotlin", ".swift": "swift", ".r": "r",
    ".jl": "julia", ".lua": "lua", ".pl": "perl", ".dart": "dart",
}


def log(msg: str, style: str = "") -> None:
    if HAS_RICH:
        console.print(msg, style=style)
    else:
        print(msg)


# ---------------------------------------------------------------------------
# .gitignore handling — uses `pathspec` for accurate matching if available,
# otherwise falls back to a simple fnmatch-based approximation.
# ---------------------------------------------------------------------------
def load_gitignore_lines(root: Path) -> List[str]:
    gi = root / ".gitignore"
    if not gi.exists():
        return []
    lines = []
    for line in gi.read_text(errors="ignore").splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            lines.append(line)
    return lines


def build_matcher(root: Path, extra_patterns: List[str], respect_gitignore: bool):
    """Returns a callable(rel_path: str) -> bool (True = should be excluded)."""
    gi_lines = load_gitignore_lines(root) if respect_gitignore else []
    all_patterns = gi_lines + extra_patterns

    if HAS_PATHSPEC and all_patterns:
        spec = pathspec.PathSpec.from_lines("gitwildmatch", all_patterns)

        def matcher(rel_path: str) -> bool:
            return spec.match_file(rel_path)

        return matcher

    def fallback_matcher(rel_path: str) -> bool:
        base = os.path.basename(rel_path)
        for pat in all_patterns:
            pat = pat.rstrip("/")
            if fnmatch.fnmatch(rel_path, pat) or fnmatch.fnmatch(rel_path, f"*/{pat}") or fnmatch.fnmatch(base, pat):
                return True
        return False

    return fallback_matcher


# ---------------------------------------------------------------------------
# File discovery
# ---------------------------------------------------------------------------
@dataclass
class FileEntry:
    path: Path
    rel: str
    size: int
    lines: int = 0
    tokens_est: int = 0
    content: str = ""


def is_probably_binary(path: Path, blocksize: int = 2048) -> bool:
    try:
        with open(path, "rb") as f:
            chunk = f.read(blocksize)
        if b"\x00" in chunk:
            return True
        text_chars = bytearray({7, 8, 9, 10, 12, 13, 27} | set(range(0x20, 0x100)) - {0x7F})
        nontext = chunk.translate(None, bytes(text_chars))
        return bool(chunk) and (len(nontext) / len(chunk) > 0.30)
    except Exception:
        return True


def discover_files(
    root: Path,
    extensions: Optional[List[str]],
    exclude_patterns: List[str],
    respect_gitignore: bool,
    max_size_kb: int,
    output_name: str,
) -> List[FileEntry]:
    is_excluded = build_matcher(root, exclude_patterns, respect_gitignore)
    entries: List[FileEntry] = []

    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in DEFAULT_EXCLUDE_DIRS]
        rel_dir = os.path.relpath(dirpath, root)

        kept_dirs = []
        for d in dirnames:
            rel_d = os.path.normpath(os.path.join(rel_dir, d)).replace("\\", "/") if rel_dir != "." else d
            if not is_excluded(rel_d + "/"):
                kept_dirs.append(d)
        dirnames[:] = kept_dirs

        for fname in filenames:
            if fname in DEFAULT_EXCLUDE_FILES or fname == output_name or fname == CONFIG_FILE:
                continue
            full = Path(dirpath) / fname
            rel = os.path.normpath(os.path.join(rel_dir, fname)).replace("\\", "/") if rel_dir != "." else fname

            if is_excluded(rel):
                continue
            if extensions and full.suffix.lower().lstrip(".") not in extensions:
                continue
            try:
                size = full.stat().st_size
            except OSError:
                continue
            if size > max_size_kb * 1024:
                continue
            if is_probably_binary(full):
                continue

            entries.append(FileEntry(path=full, rel=rel, size=size))

    entries.sort(key=lambda e: e.rel.lower())
    return entries


# ---------------------------------------------------------------------------
# Interactive selection
# ---------------------------------------------------------------------------
def interactive_select(entries: List[FileEntry]) -> List[FileEntry]:
    if not entries:
        return entries

    if HAS_QUESTIONARY:
        choices = [
            questionary.Choice(title=f"{e.rel}  ({e.size / 1024:.1f} KB)", value=e.rel, checked=True)
            for e in entries
        ]
        selected = questionary.checkbox(
            "Select files to include (space to toggle, enter to confirm):",
            choices=choices,
        ).ask()
        if selected is None:
            log("Cancelled.", "yellow")
            sys.exit(0)
        selected_set = set(selected)
        return [e for e in entries if e.rel in selected_set]

    # Fallback: plain numbered exclude list
    log(f"\nFound {len(entries)} files:", "bold")
    for i, e in enumerate(entries, 1):
        print(f"  [{i}] {e.rel}  ({e.size / 1024:.1f} KB)")
    raw = input("\nEnter numbers to EXCLUDE, comma-separated (blank = include all): ").strip()
    if not raw:
        return entries
    try:
        exclude_idx = {int(x.strip()) for x in raw.split(",") if x.strip()}
    except ValueError:
        log("Couldn't parse input, including all files.", "yellow")
        return entries
    return [e for i, e in enumerate(entries, 1) if i not in exclude_idx]


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------
def render_tree(root: Path, entries: List[FileEntry]) -> str:
    lines_out = [f"{root.name}/"]
    dirs_seen = set()
    for rel in sorted(e.rel for e in entries):
        parts = rel.split("/")
        for depth in range(len(parts) - 1):
            sub = "/".join(parts[: depth + 1])
            if sub not in dirs_seen:
                dirs_seen.add(sub)
                lines_out.append("  " * (depth + 1) + parts[depth] + "/")
        lines_out.append("  " * len(parts) + parts[-1])
    return "\n".join(lines_out)


def estimate_tokens(text: str) -> int:
    return max(1, len(text) // 4)


def make_anchor(rel: str) -> str:
    return "".join(c.lower() if c.isalnum() else "-" for c in rel).strip("-")


def build_output(root: Path, entries: List[FileEntry], include_tree: bool) -> str:
    now = time.strftime("%Y-%m-%d %H:%M:%S")
    total_lines = sum(e.lines for e in entries)
    total_tokens = sum(e.tokens_est for e in entries)

    parts = [
        f"# Codebase dump — {root.resolve().name}\n",
        f"Generated: {now}",
        f"Source directory: `{root.resolve()}`",
        f"Files included: {len(entries)}",
        f"Total lines: {total_lines:,}",
        f"Estimated tokens: ~{total_tokens:,}\n",
        "> Generated by llm_concat.py — a single-file dump of this codebase for LLM review.\n",
    ]

    if include_tree:
        parts.append("## Directory structure\n\n```\n" + render_tree(root, entries) + "\n```\n")

    parts.append("## Table of contents\n")
    parts.append("\n".join(f"- [{e.rel}](#{make_anchor(e.rel)})" for e in entries) + "\n")

    parts.append("## Files\n")
    for e in entries:
        lang = LANG_MAP.get(e.path.suffix.lower(), "")
        parts.append(f"### {e.rel}\n<a id=\"{make_anchor(e.rel)}\"></a>\n")
        parts.append(f"_{e.lines} lines, {e.size / 1024:.1f} KB, ~{e.tokens_est} tokens_\n")
        parts.append(f"```{lang}\n{e.content}\n```\n")

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def parse_args():
    p = argparse.ArgumentParser(
        description="Concatenate a codebase into a single file for pasting into an LLM.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    p.add_argument("directory", nargs="?", default=".", help="Directory to scan (default: current directory)")
    p.add_argument("-o", "--output", default="llm_dump.md", help="Output file name (default: llm_dump.md)")
    p.add_argument("-e", "--ext", help="Comma-separated extensions to include, e.g. py,js,ts")
    p.add_argument("-x", "--exclude", action="append", default=[], help="Glob pattern to exclude (repeatable)")
    p.add_argument("--no-gitignore", action="store_true", help="Don't respect .gitignore")
    p.add_argument("--max-size", type=int, default=500, help="Skip files bigger than this many KB (default: 500)")
    p.add_argument("-i", "--interactive", action="store_true", help="Interactively choose which files to include")
    p.add_argument("--no-tree", action="store_true", help="Don't include a directory tree in the output")
    p.add_argument("--clipboard", action="store_true", help="Copy the result to the clipboard")
    p.add_argument("--stats-only", action="store_true", help="Print stats only, don't write the output file")
    p.add_argument("--use-config", action="store_true", help="Load saved settings from .llm_concat_config.json")
    p.add_argument("--save-config", action="store_true", help="Remember these settings for next time")
    return p.parse_args()


def load_config(root: Path) -> dict:
    cfg_path = root / CONFIG_FILE
    if cfg_path.exists():
        try:
            return json.loads(cfg_path.read_text())
        except Exception:
            return {}
    return {}


def save_config(root: Path, args) -> None:
    cfg_path = root / CONFIG_FILE
    data = {
        "ext": args.ext,
        "exclude": args.exclude,
        "no_gitignore": args.no_gitignore,
        "max_size": args.max_size,
        "no_tree": args.no_tree,
    }
    cfg_path.write_text(json.dumps(data, indent=2))


def main():
    args = parse_args()
    root = Path(args.directory).resolve()

    if not root.exists() or not root.is_dir():
        log(f"Error: '{root}' is not a valid directory.", "bold red")
        sys.exit(1)

    if args.use_config:
        cfg = load_config(root)
        if cfg:
            args.ext = args.ext or cfg.get("ext")
            args.exclude = args.exclude or cfg.get("exclude", [])
            args.no_gitignore = args.no_gitignore or cfg.get("no_gitignore", False)
            args.max_size = cfg.get("max_size", args.max_size)
            args.no_tree = args.no_tree or cfg.get("no_tree", False)

    if HAS_RICH:
        console.print(Panel.fit(
            "[bold cyan]llm_concat[/bold cyan] — bundling your codebase for LLM review",
            border_style="cyan",
        ))
    else:
        print("=== llm_concat — bundling your codebase for LLM review ===")

    if not HAS_RICH or not HAS_QUESTIONARY or not HAS_PATHSPEC or not HAS_CLIPBOARD:
        missing = [n for n, ok in [("rich", HAS_RICH), ("questionary", HAS_QUESTIONARY),
                                    ("pathspec", HAS_PATHSPEC), ("pyperclip", HAS_CLIPBOARD)] if not ok]
        log(f"(tip: `pip install {' '.join(missing)}` unlocks a nicer UI, accurate .gitignore matching, "
            f"and clipboard support)", "dim")

    extensions = [e.strip().lstrip(".").lower() for e in args.ext.split(",")] if args.ext else None

    log(f"\nScanning {root} ...")
    entries = discover_files(
        root=root,
        extensions=extensions,
        exclude_patterns=args.exclude,
        respect_gitignore=not args.no_gitignore,
        max_size_kb=args.max_size,
        output_name=args.output,
    )

    if not entries:
        log("No matching files found. Try adjusting --ext / --exclude / --max-size.", "yellow")
        sys.exit(0)

    if args.interactive:
        entries = interactive_select(entries)
        if not entries:
            log("No files selected. Exiting.", "yellow")
            sys.exit(0)

    iterator = track(entries, description="Reading files...") if HAS_RICH else entries
    kept = []
    for e in iterator:
        try:
            text = e.path.read_text(encoding="utf-8", errors="replace")
        except Exception as ex:
            log(f"  ! Skipping {e.rel} (read error: {ex})", "yellow")
            continue
        e.content = text
        e.lines = text.count("\n") + 1
        e.tokens_est = estimate_tokens(text)
        kept.append(e)
    entries = kept

    output_text = build_output(root, entries, include_tree=not args.no_tree)

    total_lines = sum(e.lines for e in entries)
    total_tokens = sum(e.tokens_est for e in entries)
    total_size_kb = sum(e.size for e in entries) / 1024

    if HAS_RICH:
        table = Table(title="Summary", show_header=True, header_style="bold cyan")
        table.add_column("Metric")
        table.add_column("Value", justify="right")
        table.add_row("Files included", str(len(entries)))
        table.add_row("Total lines", f"{total_lines:,}")
        table.add_row("Total size", f"{total_size_kb:.1f} KB")
        table.add_row("Estimated tokens", f"~{total_tokens:,}")
        console.print(table)
    else:
        print(f"\nFiles included: {len(entries)}")
        print(f"Total lines: {total_lines:,}")
        print(f"Total size: {total_size_kb:.1f} KB")
        print(f"Estimated tokens: ~{total_tokens:,}")

    if args.stats_only:
        sys.exit(0)

    out_path = Path(args.output)
    out_path.write_text(output_text, encoding="utf-8")
    log(f"\n✓ Wrote {out_path.resolve()}", "bold green")

    if args.clipboard:
        if HAS_CLIPBOARD:
            pyperclip.copy(output_text)
            log("✓ Copied to clipboard", "bold green")
        else:
            log("! pyperclip not installed — run `pip install pyperclip` to enable --clipboard", "yellow")

    if args.save_config:
        save_config(root, args)
        log(f"✓ Saved settings to {CONFIG_FILE}", "green")


if __name__ == "__main__":
    main()