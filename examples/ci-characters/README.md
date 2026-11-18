# Characters built in CI

Two character files that the [Build characters](../../.github/workflows/characters.yml) GitHub Actions workflow turns into rigged, animated models. Copy the workflow and a `characters/` folder into your own repository, keep your character files there, and run the workflow from the Actions tab. The models come back as a download on the run.

- `characters/hero.json`: The Adventurer, renamed Scout, aged 34.
- `characters/guard.json`: The Soldier, renamed Gate guard, with a determined face.

Make more with `npx ara3d new <name> --preset "<preset>"` or the builder's **Save character**, and change any field the [character schema](https://ara3dgen.com/schemas/character.v1.json) lists. Your editor checks the files against it as you type.

The same build on your own machine:

```bash
npx ara3d export --params characters/hero.json --params characters/guard.json --animations idle,walk,run
```

See [Building characters in CI](https://ara3dgen.com/docs/cli/#building-characters-in-ci) in the command-line guide.
