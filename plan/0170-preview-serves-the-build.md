# 0170 preview-serves-the-build

## `npm run preview` はゲームを起動していなかった

ビルドを実機で確かめようとして気付いた。`vite preview` で開いた画面は、
**静的な見た目だけがあって何も動かない**。

原因は `vite.config.ts` の1行である。

```ts
base: command === "build" ? "/game2/" : "/",
```

`vite preview` の `command` は `"serve"` である。ところが preview が配るのは
`dist/`——**既に `/game2/` を焼き込んだ index.html** である。だから、

- ページは `/game2/assets/index-*.js` を要求する
- サーバーは `"/"` しか知らない

という食い違いが起きる。base の説明コメント自身が「`vite dev`/`vite preview`
は "/" のままなので手元の作業に影響しない」と書いていたが、**preview は影響を
受ける側だった**。

## curl では見つからない

これが残っていた理由でもある。preview の SPA フォールバックは、知らない
パスに対して **index.html を 200 で返す**。だから

```
$ curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4181/game2/assets/index-CKXsiccc.js
200
```

と、**通っているように見える**。ブラウザで開くと違う。JavaScript を期待した
場所に HTML が返るので、実際にはこうなる。

```
404 http://127.0.0.1:4181/game2/assets/index-CKXsiccc.js
404 http://127.0.0.1:4181/game2/registerSW.js
```

`canvas` 要素も `#toolbar` も index.html の静的マークアップなので**存在して
しまう**。「開けている」ように見えるのはそのためで、スクリプトだけが死んで
いる。

## 直し方

Vite 6 の `ConfigEnv` は `isPreview` を持っている。`command` だけで分けず、
これを見る。

```ts
base: command === "build" || isPreview ? "/game2/" : "/",
```

`vite dev`（ソースから配る、`command === "serve"` かつ preview でない）だけが
`"/"` に残る。

## 検証

スクリプトが動いたときにしか現れないものを見る。**`canvas` の有無では判定
できない**——静的マークアップなので壊れていても1個ある。世界選択のリストは
`main.ts` が48面ぶんのボタンで埋めるので、これを数えた。

| | 世界選択のボタン | 404 |
|---|---|---|
| 修正前 | **0個** | `index-*.js`／`registerSW.js` |
| 修正後 | **48個** | 0件 |

preview の起動ログも `http://localhost:4182/game2/` に変わり、`/` と
`/game2/` のどちらで開いても起動する。

**本番の配信は元から無事である。** GitHub Pages は `dist/` を `/game2/` 配下に
置くので、壊れていたのは手元で確かめる経路だけだった。
