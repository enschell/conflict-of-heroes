# reference/

Local design references. **Not committed** (see root `.gitignore`).

## rulebook.txt

A plain-text extraction of the user's *Conflict of Heroes: Awakening the Bear*
(2nd ed.) rulebook PDF, produced with:

```
pdftotext rulebook.pdf reference/rulebook.txt
```

It exists so design/build sessions can `grep` the rules locally instead of
re-parsing the PDF (saves tokens). The graphical counter/scenario/map art does
not extract as text (those areas read as garbled) — body prose is clean.

This is copyrighted Academy Games material kept locally for personal reference
only; it is git-ignored and must not be committed or redistributed. The game's
own data (`src/data/`) is our original work, not copied from here.
