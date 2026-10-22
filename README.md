<h1 align="center">Gafitas</h1>

<p align="center"><b>Ask how something works. See it.</b><br>
A Mac app that digs up the code in your projects that answers a question, then has any model draw how it fits
together.</p>

Gafitas ("little glasses") is a fork of [DigUp](https://github.com/ARahim3/DigUp) by Abdur Rahim. DigUp searches the
files on your Mac by what's in them, with Google DeepMind's EmbeddingGemma 2 running locally. Gafitas keeps that engine
and points it at your code, in one Ask window:

1. **Dig up.** Ask a question ("¿Cómo conecto los webhooks de billing-service con todo-web?"). Gafitas finds the
   closest functions and files across the projects you index, on this Mac, in under a second.
2. **See it.** The [Pi](https://www.npmjs.com/package/@earendil-works/pi-coding-agent) coding agent, with whatever
   model you give it, answers with a puzzle: each real function, class or module is a jigsaw piece in its project's
   colour, each hand-off is the edge two pieces share, labelled with what crosses it, and the code you'd still have to
   write is an empty piece in the gap. Click a piece and your editor opens at its line. The model only picks the
   pieces and says how they fit; Gafitas draws them, so a small local model can explain as clearly as a frontier one.
   Other questions get other pictures, not paragraphs: a walk through the real lines, two places side by side, what
   in one repo matches what in another (and how sure that is), two or three ways to do it, a question with icon tiles
   to pick from, or a board of what you have, what's missing and what to decide. Click a way or a tile and that's
   your next question.
3. **Keep going.** Every question is a chat, kept on this Mac: reopen any of them at once, or keep asking. While Pi
   works you see what it's doing: what it dug up, each file it reads, what it's thinking.

The app is in Spanish, and so are its answers.

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
settings stay separate. ⇧⌥Space opens the Ask window from any app, so both apps can run side by side.

`digup`, the command-line tool from DigUp, indexes, searches and runs the evals from the terminal (`digup --help`);
`evals/` holds the queries ranking changes are measured with.

## Thanks

Gafitas is built on [DigUp](https://github.com/ARahim3/DigUp) (MIT), [EmbeddingGemma 2](https://huggingface.co/google/embeddinggemma-2)
by Google DeepMind (Apache 2.0), [llama.cpp](https://github.com/ggml-org/llama.cpp) (MIT),
[OpenUI](https://github.com/thesysdev/openui) (MIT), React (MIT) and Zod (MIT). Gafitas isn't affiliated with DigUp's author,
Google or Apple.

## License

MIT
