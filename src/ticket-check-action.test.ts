import { context } from '@actions/github';

import { run } from './ticket-check-action';

const inputs: Record<string, string> = {};
const update = jest.fn();
const createReview = jest.fn();
const listReviews = jest.fn();
const setFailed = jest.fn();

jest.mock('@actions/core', () => ({
  debug: jest.fn(),
  getInput: (name: string): string => inputs[name] ?? '',
  setFailed: (message: string): void => setFailed(message),
}));

jest.mock('@actions/github', () => ({
  context: {
    issue: { owner: 'FatbearLabs', repo: 'fireball', number: 1 },
    payload: {},
  },
  getOctokit: (): unknown => ({ rest: { pulls: { update, createReview, listReviews } } }),
}));

const ticketRegex = '(?<ticketNumber>[A-Za-z]{3,4}-\\d+)';
const litmusBranch = 'maxwell/vOjXSizeNHwyYEQZuos0AkzQ4Q4YpxJkGiH4goFOWAE/a707-INF-2061-log-excerpt-selection';
const laplaceBranch = 'maxwell/8FK-PAb60wj24InKPsqZtT0YBZAypxrYM4A2QI56-gI/a137-INF-2060-sync-artifact-maintenance';

const setPullRequest = (branch: string, title: string): void => {
  context.payload = {
    pull_request: {
      number: 1,
      title,
      body: '',
      head: { ref: branch },
      user: { login: 'maxwell-by-qualified[bot]', type: 'Bot' },
    },
  };
};

const runUntilStable = async (branch: string, title: string): Promise<string> => {
  setPullRequest(branch, title);
  await run();

  const updatedTitle = update.mock.calls.length > 0 ? update.mock.calls[0][0].title : title;

  update.mockClear();
  setPullRequest(branch, updatedTitle);
  await run();
  expect(update).not.toHaveBeenCalled();

  return updatedTitle;
};

describe('ticket-check-action', () => {
  beforeEach(() => {
    Object.assign(inputs, {
      token: 'token',
      titleRegex: ticketRegex,
      titleRegexFlags: 'gi',
      branchRegex: ticketRegex,
      branchRegexFlags: 'gi',
      bodyRegex: ticketRegex,
      bodyRegexFlags: 'gim',
      bodyURLRegexFlags: 'gim',
      titleFormat: '[%id%] %title%',
      quiet: 'true',
    });
  });

  it('leaves a Maxwell title alone when it already contains the branch ticket', async () => {
    const title = '[maxwell:litmus] [INF-2061] Verify log excerpts contain only requested events';

    setPullRequest(litmusBranch, title);
    await run();

    expect(update).not.toHaveBeenCalled();
    expect(setFailed).not.toHaveBeenCalled();
  });

  it('ignores digits that appear before the ticket in a Maxwell branch', async () => {
    await expect(runUntilStable(litmusBranch, '[maxwell:litmus] Verify log excerpts')).resolves.toBe(
      '[INF-2061] [maxwell:litmus] Verify log excerpts'
    );
    await expect(runUntilStable(laplaceBranch, '[maxwell:laplace] Keep artifact Git maintenance')).resolves.toBe(
      '[INF-2060] [maxwell:laplace] Keep artifact Git maintenance'
    );
  });

  it('adds the branch ticket to a title once across repeated runs', async () => {
    await expect(runUntilStable('sahand/inf-2066-ticket-check', 'Fix ticket check')).resolves.toBe(
      '[INF-2066] Fix ticket check'
    );
  });

  it('uppercases an existing lowercase ticket in the title', async () => {
    await expect(runUntilStable('sahand/inf-2066-ticket-check', 'inf-2066 fix ticket check')).resolves.toBe(
      'INF-2066 fix ticket check'
    );
  });
});
