<h1 align="center">Gafitas</h1>

<p align="center"><b>Ask how something works. See it.</b><br>
A Mac app that digs up the code in your projects that answers a question, then has any model draw how it fits
together.</p>

Gafitas ("little glasses") is a fork of [DigUp](https://github.com/ARahim3/DigUp) by Abdur Rahim. DigUp searches the
files on your Mac by what's in them, with Google DeepMind's EmbeddingGemma 2 running locally. Gafitas keeps that engine
and adds an Ask window for code:

1. **Dig up.** Describe a task or ask a question ("How can I connect the Hermes skill creation to my app harness?").
   Gafitas finds the closest functions and files across the projects you index, on this Mac, in under a second,
   grouped by project, with Reuse, Adapt and Ignore.
2. **See it.** The [Pi](https://www.npmjs.com/package/@earendil-works/pi-coding-agent) coding agent, with whatever model you give it, writes
   the answer as an interactive figure: a small machine whose working *is* the idea, each part tied to real code.
   The model only does the thinking (which machine, which parts, which steps); Gafitas ships the drawings, so a small
   local model can explain as clearly as a frontier one.
3. **Map it.** Every stretch of code as a dot placed by meaning, colored by project, with your question among its
   matches.

## Private, with one exception

Indexing and the dig-up never leave your Mac, as in DigUp. Writing an answer is the exception: Pi sends your question
and the code Gafitas found to the model you chose, and Gafitas asks before the first time it sends anything to a model
that isn't on this Mac. With a local model, nothing leaves.

## Build from source

You need an Apple Silicon Mac with macOS 14 or later, git, CMake (or `uv`) and Swift 6.2: the Command Line Tools are
enough. For answers, install Pi (`npm install -g @earendil-works/pi-coding-agent`) and give it a model.

```sh
scripts/build-llama.sh    # llama.cpp at a pinned tag, with a one-line patch (a few minutes)
scripts/test.sh           # swift test, also with only the Command Line Tools
./build.sh                # → build.noindex/Gafitas.app
```

If DigUp is installed, Gafitas uses its model files instead of downloading another 865 MB copy; the indexes and
settings stay separate. The search panel opens with ⇧⌥Space, so both apps can run side by side.

`digup`, the command-line tool from DigUp, indexes, searches and runs the evals from the terminal (`digup --help`);
`evals/` holds the queries ranking changes are measured with.

## Thanks

Gafitas is built on [DigUp](https://github.com/ARahim3/DigUp) (MIT), [EmbeddingGemma 2](https://huggingface.co/google/embeddinggemma-2)
by Google DeepMind (Apache 2.0), [llama.cpp](https://github.com/ggml-org/llama.cpp) (MIT),
[Sparkle](https://sparkle-project.org) (MIT), [OpenUI](https://github.com/thesysdev/openui) (MIT) and the
[anatomy](https://github.com/wheresryan22/anatomy) figure kit (MIT). Gafitas isn't affiliated with DigUp's author,
Google or Apple.

## License

MIT
