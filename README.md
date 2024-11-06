# 利用大语言模型，对Pull Request的进行codereview，并生成代码评论。

### 参考配置：
```
name: LLM Code Review

permissions:
  contents: read
  pull-requests: write

on:
  pull_request:
    types: [opened, reopened, synchronize]

jobs:
  llm-code-review:
    runs-on: ubuntu-latest
    steps:
      - uses: fit2cloud/LLM-CodeReview-Action@main
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          OPENAI_API_KEY: ${{ secrets.ALIYUN_LLM_API_KEY }}
          LANGUAGE: Chinese
          OPENAI_API_ENDPOINT: https://dashscope.aliyuncs.com/compatible-mode/v1
          MODEL: qwen2-1.5b-instruct
          PROMPT: "请检查下面的代码差异是否有不规范、潜在的问题或者优化建议"
          top_p: 1
          temperature: 1
          # max_tokens: 10000
          MAX_PATCH_LENGTH: 10000 
          IGNORE_PATTERNS: "/node_modules,*.md,/dist,/.github"
          FILE_PATTERNS: "*.java,*.go,*.py,*.vue,*.ts,*.js,*.css,*.scss,*.html"
```

## 
### 基于https://github.com/anc95/ChatGPT-CodeReview

1.做了部分精简 <br>
2.增加参数MAX_REVIEW_COUNT和FILE_PATTERNS
