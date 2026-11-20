/**
 * Two-player Gomoku, end to end: a challenge link, live move sync between two
 * browsers, server-side turn enforcement, and a win.
 *
 * Run with `npx deepspace test run gomoku` (needs two test accounts — see
 * collab.spec.ts for how to create them).
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import type { Page } from '@playwright/test'

test.skip(loadAllTestAccounts().length < 2, 'Needs 2 usable test accounts (see collab.spec.ts).')

const N = 15
/** Click the intersection at (row, col) on the board SVG. */
async function clickCell(page: Page, row: number, col: number) {
  await page.getByTestId('board').locator('rect[role="gridcell"]').nth(row * N + col).click()
}

test('challenge link → live two-player game → five in a row', async ({ users }) => {
  test.setTimeout(90_000)
  const [a, b] = await users(2)

  // A creates a challenge as Black.
  await a.page.goto('/play')
  await a.page.getByRole('radiogroup', { name: 'Your colour' }).nth(1).getByRole('radio', { name: /Black/ }).click()
  await a.page.getByTestId('start-pvp').click()
  await a.page.waitForURL(/\/g\//)
  await expect(a.page.getByTestId('status')).toContainText('Waiting for your opponent')

  // B opens the link and takes the seat; A sees it without reloading.
  await b.page.goto(a.page.url())
  await b.page.getByTestId('join').click()
  await expect(a.page.getByTestId('status')).toHaveText('Your move.', { timeout: 15_000 })

  // White cannot move first — the server refuses it.
  await expect(b.page.getByTestId('status')).toContainText('to move')

  // Black builds a row of five on row 7; White plays row 8.
  for (let c = 0; c < 5; c++) {
    await clickCell(a.page, 7, c)
    if (c === 4) break
    await expect(b.page.getByTestId('status')).toHaveText('Your move.', { timeout: 15_000 })
    await clickCell(b.page, 8, c)
    await expect(a.page.getByTestId('status')).toHaveText('Your move.', { timeout: 15_000 })
  }

  await expect(a.page.getByTestId('status')).toHaveText('Five in a row — you win.', { timeout: 15_000 })
  await expect(b.page.getByTestId('status')).toContainText('wins with five in a row', { timeout: 15_000 })
})

test('engine replies to a move', async ({ users }) => {
  test.setTimeout(60_000)
  const [a] = await users(1)
  await a.page.goto('/play')
  await a.page.getByRole('radio', { name: 'Easy' }).click()
  await a.page.getByRole('radiogroup', { name: 'Your colour' }).first().getByRole('radio', { name: /Black/ }).click()
  await a.page.getByTestId('start-bot').click()
  await a.page.waitForURL(/\/g\//)
  await expect(a.page.getByTestId('status')).toHaveText('Your move.', { timeout: 15_000 })
  await clickCell(a.page, 7, 7)
  await expect(a.page.getByText(/Moves · 2/)).toBeVisible({ timeout: 20_000 })
  await expect(a.page.getByTestId('status')).toHaveText('Your move.')
})

test('draw offer: White offers, Black accepts, both see the result live', async ({ users }) => {
  test.setTimeout(90_000)
  const [a, b] = await users(2)
  await a.page.goto('/play')
  await a.page.getByRole('radiogroup', { name: 'Your colour' }).nth(1).getByRole('radio', { name: /Black/ }).click()
  await a.page.getByTestId('start-pvp').click()
  await a.page.waitForURL(/\/g\//)
  await b.page.goto(a.page.url())
  await b.page.getByTestId('join').click()
  await expect(a.page.getByTestId('status')).toHaveText('Your move.', { timeout: 15_000 })

  await clickCell(a.page, 7, 7)
  await expect(b.page.getByTestId('status')).toHaveText('Your move.', { timeout: 15_000 })
  await b.page.getByTestId('offer-draw').click()
  await expect(b.page.getByText('Draw offered.')).toBeVisible({ timeout: 15_000 })

  const offer = a.page.getByTestId('draw-offer')
  await expect(offer).toContainText('Your opponent offers a draw.', { timeout: 15_000 })
  await offer.getByRole('button', { name: 'Accept' }).click()

  await expect(a.page.getByTestId('status')).toHaveText('Draw agreed.', { timeout: 15_000 })
  await expect(b.page.getByTestId('status')).toHaveText('Draw agreed.', { timeout: 15_000 })
})
