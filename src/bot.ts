import { Context, Probot } from 'probot';

import { Chat } from './chat.js';

const OPENAI_API_KEY = 'OPENAI_API_KEY';
const MAX_PATCH_COUNT = process.env.MAX_PATCH_LENGTH
  ? +process.env.MAX_PATCH_LENGTH
  : Infinity;

const filter_patterns = (filePath: string, patterns: string[])=> {
    return patterns.some(pattern => {
        if (pattern.startsWith('*')) {
            // 处理通配符模式 (如 *.txt)
            const regex = new RegExp(pattern.replace(/\*/g, '.*'));
            return regex.test(filePath);
        } else {
            // 处理路径匹配 (如 /node_modules)
            return filePath.includes(pattern);
        }
    });
}

export const robot = (app: Probot) => {
  const loadChat = async (context: Context) => {
    if (process.env.OPENAI_API_KEY) {
      return new Chat(process.env.OPENAI_API_KEY);
    }

    const repo = context.repo();

    try {
      const { data } = (await context.octokit.request(
        'GET /repos/{owner}/{repo}/actions/variables/{name}',
        {
          owner: repo.owner,
          repo: repo.repo,
          name: OPENAI_API_KEY,
        }
      )) as any;

      if (!data?.value) {
        return null;
      }

      return new Chat(data.value);
    } catch {
      await context.octokit.issues.createComment({
        repo: repo.repo,
        owner: repo.owner,
        issue_number: context.pullRequest().pull_number,
        body: `Seems you are using me but didn't get OPENAI_API_KEY seted in Variables/Secrets for this repo. you could follow [readme](https://github.com/anc95/ChatGPT-CodeReview) for more information`,
      });
      return null;
    }
  };

  app.on(
    ['pull_request.opened', 'pull_request.synchronize'],
    async (context) => {
      const repo = context.repo();
      const chat = await loadChat(context);

      if (!chat) {
        console.log('Chat initialized failed');
        return 'no chat';
      }

      const pull_request = context.payload.pull_request;

      if (
        pull_request.state === 'closed' ||
        pull_request.locked
      ) {
        console.log('invalid event payload');
        return 'invalid event payload';
      }

      const target_label = process.env.TARGET_LABEL;
      if (
        target_label &&
        (!pull_request.labels?.length ||
          pull_request.labels.every((label) => label.name !== target_label))
      ) {
        console.log('no target label attached');
        return 'no target label attached';
      }

      const data = await context.octokit.repos.compareCommits({
        owner: repo.owner,
        repo: repo.repo,
        base: context.payload.pull_request.base.sha,
        head: context.payload.pull_request.head.sha,
      });

      let { files: changedFiles, commits } = data.data;

      let all_files = changedFiles

      if (context.payload.action === 'synchronize' && commits.length >= 2) {
        const {
          data: { files },
        } = await context.octokit.repos.compareCommits({
          owner: repo.owner,
          repo: repo.repo,
          base: commits[commits.length - 2].sha,
          head: commits[commits.length - 1].sha,
        });
        all_files = files
      }

      const ignoreList = (process.env.IGNORE || process.env.ignore || '')
          .split('\n')
          .filter((v) => v !== '');

      const ignorePatterns = (process.env.IGNORE_PATTERNS || '').split(',')

      const filePatterns = (process.env.FILE_PATTERNS || '').split(',')

      const filesNames = all_files?.map((file) => file.filename) || [];

      console.info('changed files:', changedFiles);

      if (process.env.FILE_PATTERNS) {
          changedFiles = changedFiles?.filter(
              (file) =>
                  filter_patterns(file.filename, filePatterns)
                  && !ignoreList.includes(file.filename) &&
                  !filter_patterns(file.filename, ignorePatterns)
          );
      } else {
          changedFiles = changedFiles?.filter(
              (file) =>
                  filesNames.includes(file.filename) &&
                  !ignoreList.includes(file.filename) &&
                  !filter_patterns(file.filename, ignorePatterns)
          );
      }

      console.info('filter changed files:', changedFiles);

      // 按changes降序排序
      changedFiles = changedFiles?.sort((a, b) => b.changes - a.changes);
      console.info('sort changed files:', changedFiles);

      if (!changedFiles?.length) {
        console.log('no change found');
        return 'no change';
      }

      console.time('gpt cost');

      let count = 1
      const maxReviewCount = process.env.MAX_REVIEW_COUNT || 3
      for (let i = 0; i < changedFiles.length; i++) {
        const file = changedFiles[i];
        const patch = file.patch || '';

        if (file.status !== 'modified' && file.status !== 'added') {
          continue;
        }

        if (!patch || patch.length > MAX_PATCH_COUNT) {
          console.log(
            `${file.filename} skipped caused by its diff is too large`
          );
          continue;
        }
        // 限制最大review次数
        if (count > maxReviewCount) {
            console.info('count > MAX_REVIEW_COUNT:', count, maxReviewCount);
            break;
        }
        count++

        try {
          const res = await chat?.codeReview(patch);

          if (!!res) {
            await context.octokit.pulls.createReviewComment({
              repo: repo.repo,
              owner: repo.owner,
              pull_number: context.pullRequest().pull_number,
              commit_id: commits[commits.length - 1].sha,
              path: file.filename,
              body: res,
              position: patch.split('\n').length - 1,
            });
          }
        } catch (e) {
          console.error(`review ${file.filename} failed`, e);
        }
      }

      console.timeEnd('gpt cost');
      console.info(
        'successfully reviewed',
        context.payload.pull_request.html_url
      );

      return 'success';
    }
  );
};
