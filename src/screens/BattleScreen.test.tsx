import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SETTINGS_STORAGE_KEY } from '@/hooks/useSettings'
import { TEAM_STORAGE_KEY } from '@/hooks/useTeam'
import { clearCreations, saveCreation } from '@/lib/creation-store'
import { parseTeam, serializeTeam, type TeamMember } from '@/lib/team/team'
import { stubFetch } from '@/test/fake-api'
import { renderWithClient } from '@/test/render'

import { BattleScreen, parsePlayerId } from './BattleScreen'

// rng always 0: the wild creature is #2 Britney (Fighting) at the team level
// − 2 (Lv3, 23 HP, speed 15), the AI picks its best move, every move hits and
// crits, rolls are minimum and throws always succeed. At Lv5 #1 Geovanni
// (speed 18) and #3 Hershel (19) move first; their Flying/Fairy moves would
// knock her out, so tests that need her to survive use Quick Tackle (6 and 5
// damage).
const alwaysZero = () => 0

const liveRegion = () => {
  const region = document.querySelector('[aria-live="polite"]')
  if (!region) throw new Error('No live region')
  return region
}
const expectMessage = (text: RegExp | string) =>
  waitFor(() => expect(liveRegion()).toHaveTextContent(text))
const savedTeam = () => parseTeam(localStorage.getItem(TEAM_STORAGE_KEY))
const save = (members: TeamMember[]) =>
  localStorage.setItem(TEAM_STORAGE_KEY, serializeTeam(members))
const member = (
  uid: string,
  creatureId: number,
  extra: Partial<TeamMember> = {}
): TeamMember => ({
  creatureId,
  hp: null,
  level: 5,
  uid,
  xp: 125,
  ...extra
})

beforeEach(() => {
  // Reduced motion: text appears whole and HP bars jump, so tests don't wait.
  vi.stubGlobal('matchMedia', (query: string) => ({
    addEventListener: () => {},
    matches: query.includes('reduce'),
    removeEventListener: () => {}
  }))
})

async function open(playerId: null | number = null) {
  stubFetch()
  renderWithClient(<BattleScreen playerId={playerId} rng={alwaysZero} />)
  await expectMessage('A wild Britney appeared!')
  await readUntil(/What will .+ do\?/)
}

// Presses Enter until the live region matches (messages advance on Enter).
async function readUntil(text: RegExp | string) {
  for (let i = 0; i < 40; i++) {
    if (liveRegion().textContent.match(text)) return
    await userEvent.keyboard('{Enter}')
  }
  throw new Error(
    `Never saw ${String(text)}; last: ${liveRegion().textContent}`
  )
}

afterEach(() => clearCreations())

describe('BattleScreen', () => {
  it('battles with a custom card from the Creature Lab', async () => {
    await saveCreation({
      attack: 80,
      defense: 70,
      description: 'A sleepy fox',
      generation: 10,
      height: 0.6,
      hp: 55,
      id: 1001,
      imageUrl: 'data:image/jpeg;base64,AAAA',
      name: 'Embercub',
      specialAttack: 90,
      specialDefense: 60,
      speed: 100,
      types: ['Fire'],
      weight: 9.5
    })
    stubFetch()
    renderWithClient(<BattleScreen playerId={1001} rng={alwaysZero} />)
    // Custom ids aren't in the catalog, so the wild pick skips nothing: #1.
    await expectMessage('A wild Geovanni appeared!')
    expect(savedTeam()).toEqual([expect.objectContaining({ creatureId: 1001 })])
    expect(
      screen.getByRole('region', { name: 'Your creature' })
    ).toHaveTextContent('Embercub')
  })

  // The bug: ▶ Battle on a card sent out whoever already led the team.
  it('leads with the picked creature when the team already has others', async () => {
    save([member('ten', 10)])
    stubFetch()
    renderWithClient(<BattleScreen playerId={1} rng={alwaysZero} />)
    await expectMessage('A wild Britney appeared!')
    expect(savedTeam().map(m => m.creatureId)).toEqual([1, 10])
    expect(
      screen.getByRole('region', { name: 'Your creature' })
    ).toHaveTextContent('Geovanni')
  })

  it('says so when a full team has no room for the pick, then can battle anyway', async () => {
    save(Array.from({ length: 6 }, (_, i) => member(`m${i}`, 20 + i)))
    stubFetch()
    renderWithClient(<BattleScreen playerId={1} rng={alwaysZero} />)
    expect(
      await screen.findByText(/Your team is full, so Geovanni can't join/)
    ).toBeInTheDocument()
    expect(savedTeam()).toHaveLength(6)
    await userEvent.click(
      screen.getByRole('button', { name: 'Battle with my team' })
    )
    await expectMessage('A wild Geovanni appeared!')
  })

  it('starts a team from the picked creature when the team is empty', async () => {
    await open(1)
    expect(savedTeam()).toEqual([
      expect.objectContaining({ creatureId: 1, level: 5 })
    ])
    const wild = screen.getByRole('region', { name: 'Wild creature' })
    const mine = screen.getByRole('region', { name: 'Your creature' })
    expect(wild).toHaveTextContent('Lv3')
    expect(wild).toHaveTextContent('23/23')
    expect(mine).toHaveTextContent('Lv5')
    expect(mine).toHaveTextContent('17/17')
  })

  it('has FIGHT, TEAM, CATCH and RUN on arrow keys', async () => {
    await open(1)
    expect(screen.getByRole('button', { name: 'Fight' })).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('button', { name: 'Team' })).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('button', { name: 'Run' })).toHaveFocus()
    await userEvent.keyboard('{ArrowLeft}')
    expect(screen.getByRole('button', { name: /Catch/ })).toHaveFocus()
  })

  it('plays with the handheld D-pad and A/B like the keyboard', async () => {
    await open(1)
    const control = (key: string) =>
      document.querySelector<HTMLButtonElement>(`[data-control="${key}"]`)!
    await userEvent.click(control('ArrowRight'))
    expect(screen.getByRole('button', { name: 'Team' })).toHaveFocus()
    await userEvent.click(control('ArrowLeft'))
    expect(screen.getByRole('button', { name: 'Fight' })).toHaveFocus()

    await userEvent.click(control('A')) // FIGHT opens the move list
    expect(screen.getByRole('group', { name: /move/i })).toBeInTheDocument()
    await userEvent.click(control('B')) // back to the main menu
    expect(screen.getByRole('button', { name: 'Fight' })).toHaveFocus()
  })

  // The bug: a click off the screen left the D-pad pressing keys on <body>.
  it('brings the cursor back when focus has left the screen', async () => {
    await open(1)
    const control = (key: string) =>
      document.querySelector<HTMLButtonElement>(`[data-control="${key}"]`)!
    await userEvent.click(control('ArrowRight'))
    act(() => (document.activeElement as HTMLElement).blur())

    await userEvent.click(control('ArrowLeft')) // first press: back to TEAM
    expect(screen.getByRole('button', { name: 'Team' })).toHaveFocus()
    await userEvent.click(control('ArrowLeft'))
    expect(screen.getByRole('button', { name: 'Fight' })).toHaveFocus()

    act(() => (document.activeElement as HTMLElement).blur())
    await userEvent.click(control('A')) // A presses where the cursor was
    expect(screen.getByRole('group', { name: /move/i })).toBeInTheDocument()
  })

  it('moves between the end screen buttons with the D-pad', async () => {
    await open(1)
    const control = (key: string) =>
      document.querySelector<HTMLButtonElement>(`[data-control="${key}"]`)!
    await userEvent.click(screen.getByRole('button', { name: 'Run' }))
    await readUntil('Got away safely!')
    while (!screen.queryByRole('button', { name: 'Battle again' })) {
      await userEvent.keyboard('{Enter}')
    }
    expect(screen.getByRole('button', { name: 'Battle again' })).toHaveFocus()
    await userEvent.click(control('ArrowRight'))
    expect(screen.getByRole('button', { name: 'Change team' })).toHaveFocus()
    await userEvent.click(control('ArrowDown')) // last in the row: stays
    expect(screen.getByRole('button', { name: 'Change team' })).toHaveFocus()
    await userEvent.click(control('ArrowLeft'))
    expect(screen.getByRole('button', { name: 'Battle again' })).toHaveFocus()
    expect(
      screen.queryByRole('link', { name: 'Back to explorer' })
    ).not.toBeInTheDocument()
  })

  it('offers full screen only where the browser supports it', async () => {
    await open(1)
    // jsdom has no Fullscreen API, like iPhone Safari: no button.
    expect(
      screen.queryByRole('button', { name: 'Full screen' })
    ).not.toBeInTheDocument()
  })

  it('leaves full screen from the Exit button', async () => {
    await open(1)
    const stage = document.querySelector('.battle-stage')!
    // Simulate the browser entering full screen on the stage.
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: stage
    })
    const exit = vi.fn(() => Promise.resolve())
    document.exitFullscreen = exit
    act(() => {
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    await userEvent.click(
      screen.getByRole('button', { name: 'Exit full screen (Esc)' })
    )
    expect(exit).toHaveBeenCalledOnce()

    // @ts-expect-error jsdom has none of these; remove the stubs.
    delete document.fullscreenElement
    // @ts-expect-error likewise.
    delete document.exitFullscreen
  })

  it('puts the battle stage full screen', async () => {
    // jsdom has no Fullscreen API: add just enough of it for this test.
    Object.defineProperty(document, 'fullscreenEnabled', {
      configurable: true,
      value: true
    })
    const request = vi.fn(() => Promise.resolve())
    HTMLElement.prototype.requestFullscreen = request
    await open(1)
    await userEvent.click(screen.getByRole('button', { name: 'Full screen' }))
    expect(request).toHaveBeenCalledOnce()
    expect(request.mock.contexts[0]).toHaveClass('battle-stage')
    // @ts-expect-error jsdom has no requestFullscreen; remove the stub.
    delete HTMLElement.prototype.requestFullscreen
    // @ts-expect-error likewise for fullscreenEnabled.
    delete document.fullscreenEnabled
  })

  it('switches the screen between classic greens and color', async () => {
    await open(1)
    const screenEl = () => document.querySelector('[data-classic]')
    expect(screenEl()).not.toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Classic' }))
    expect(screenEl()).toBeNull()
    expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toContain(
      '"classic":false'
    )
  })

  it('saves HP after every turn', async () => {
    await open(1)
    await userEvent.keyboard('{Enter}{ArrowDown}{Enter}') // FIGHT, Quick Tackle
    await readUntil(/^Wild Britney used .+!$/)
    expect(savedTeam()[0].hp).not.toBeNull()
  })

  it('catches the wild creature and adds it to the team', async () => {
    await open(1)
    await userEvent.click(screen.getByRole('button', { name: /Catch/ }))
    await expectMessage('You threw a ball!')
    await readUntil('Gotcha! Wild Britney was caught!')
    // XP lines follow, then the end screen.
    await readUntil('Britney joined your team.')
    expect(
      await screen.findByRole('heading', { name: 'Gotcha!' })
    ).toBeInTheDocument()
    expect(savedTeam().map(m => m.creatureId)).toEqual([1, 2])
  })

  it('switches creatures from the TEAM menu', async () => {
    save([member('a', 1), member('b', 3)])
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Team' }))
    const list = screen.getByRole('group', { name: 'Team' })
    expect(
      within(list).getByRole('button', { name: /Geovanni/ })
    ).toBeDisabled()
    await userEvent.click(within(list).getByRole('button', { name: /Hershel/ }))
    await expectMessage('Come back, Geovanni! Go, Hershel!')
  })

  it('asks who to send out after a faint, and loses only when all faint', async () => {
    save([member('a', 1, { hp: 1 }), member('b', 3, { hp: 1 })])
    await open()
    await userEvent.keyboard('{Enter}{ArrowDown}{Enter}') // FIGHT, Quick Tackle
    await readUntil('Who will you send out?')
    await userEvent.click(screen.getByRole('button', { name: /Hershel/ }))
    await expectMessage('Go! Hershel!')
    await readUntil(/What will Hershel do\?/)
    // Hershel's moves: Glimmer, Moonbeam Burst, Palm Strike, Quick Tackle.
    await userEvent.keyboard('{Enter}{ArrowDown}{ArrowRight}{Enter}')
    await readUntil(/You lost/)
    expect(
      screen.getByRole('heading', { name: 'You lost…' })
    ).toBeInTheDocument()
    expect(savedTeam().every(m => m.hp === 0)).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: 'Battle again' }))
    expect(await screen.findByText(/too tired to battle/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Rest' }))
    await expectMessage('A wild Britney appeared!')
  })

  it('disables CATCH when the saved team is full, even if a member is missing', async () => {
    // Five on file plus one id that isn't: the battle party is 5, the team 6.
    save([
      member('a', 1),
      member('b', 3),
      member('c', 4),
      member('d', 5),
      member('e', 6),
      member('gone', 5000)
    ])
    await open()
    expect(screen.getByRole('button', { name: /Catch/ })).toBeDisabled()
  })

  it('explains a team whose creatures are all missing instead of asking to rest', async () => {
    stubFetch()
    save([member('gone', 5000)])
    renderWithClient(<BattleScreen playerId={null} rng={alwaysZero} />)
    expect(await screen.findByText(/no longer on file/)).toBeInTheDocument()
    expect(screen.queryByText(/too tired/)).toBeNull()
  })

  it('shows a floating damage number on a hit', async () => {
    await open(1)
    await userEvent.keyboard('{Enter}{ArrowDown}{Enter}') // FIGHT, Quick Tackle
    await expectMessage('Geovanni used Quick Tackle!')
    expect(screen.getByText('−6')).toBeInTheDocument()
  })

  it('remembers the sound and timing toggles', async () => {
    await open(1)
    const sound = screen.getByRole('button', { name: 'Sound' })
    expect(sound).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(sound)
    expect(sound).toHaveAttribute('aria-pressed', 'true')
    expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toContain('"sound":true')
    // Reduced motion (as in these tests) turns the timing bar off.
    expect(screen.getByRole('button', { name: 'Timing' })).toBeDisabled()
  })

  describe('with motion allowed', () => {
    beforeEach(() => {
      vi.stubGlobal('matchMedia', () => ({
        addEventListener: () => {},
        matches: false,
        removeEventListener: () => {}
      }))
    })

    it('runs the timing bar after picking a move, then the turn', async () => {
      await open(1)
      await userEvent.keyboard('{Enter}{ArrowDown}{Enter}') // FIGHT, Quick Tackle
      const bar = screen.getByRole('button', { name: /timing bar/i })
      expect(bar).toHaveFocus()
      await userEvent.keyboard('{Enter}')
      expect(await screen.findByText(/Perfect!|Nice!|OK/)).toBeInTheDocument()
      // The result shows briefly, then the turn plays out on its own.
      await expectMessage('Geovanni used Quick Tackle!')
    })

    it('goes back to the moves with Escape', async () => {
      await open(1)
      await userEvent.keyboard('{Enter}{ArrowDown}{Enter}')
      await userEvent.keyboard('{Escape}')
      expect(screen.queryByRole('button', { name: /timing bar/i })).toBeNull()
      expect(screen.getByRole('button', { name: /Quick Tackle/ })).toHaveFocus()
    })

    it('skips the bar when timing is turned off', async () => {
      localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({ sound: false, timing: false })
      )
      await open(1)
      await userEvent.keyboard('{Enter}{ArrowDown}{Enter}')
      expect(screen.queryByRole('button', { name: /timing bar/i })).toBeNull()
      await readUntil('Geovanni used Quick Tackle!')
    })
  })

  describe('team picker', () => {
    const tab = (name: RegExp | string) => screen.getByRole('tab', { name })
    const row = (name: RegExp | string) => screen.findByRole('button', { name })

    it('starts an empty team on the ALL list, then battles from START', async () => {
      stubFetch()
      renderWithClient(<BattleScreen playerId={null} rng={alwaysZero} />)
      expect(
        await screen.findByRole('group', { name: 'Choose your team' })
      ).toBeInTheDocument()
      expect(tab('all')).toHaveAttribute('aria-selected', 'true')
      const start = screen.getByRole('button', { name: 'Start' })
      expect(start).toBeDisabled()

      await userEvent.click(await row(/Geovanni/))
      expect(savedTeam().map(m => m.creatureId)).toEqual([1])
      expect(tab('Team 1/6')).toBeInTheDocument()

      await userEvent.click(start)
      await expectMessage('A wild Britney appeared!')
    })

    it('plays with the D-pad: ◀▶ lists, ▲▼ rows, A toggles, START', async () => {
      stubFetch()
      renderWithClient(<BattleScreen playerId={null} rng={alwaysZero} />)
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /Geovanni/ })).toHaveFocus()
      )
      const control = (key: string) =>
        document.querySelector<HTMLButtonElement>(`[data-control="${key}"]`)!
      await userEvent.click(control('ArrowDown'))
      expect(screen.getByRole('button', { name: /Britney/ })).toHaveFocus()
      await userEvent.click(control('A'))
      await userEvent.click(control('ArrowUp'))
      await userEvent.click(control('A'))
      expect(savedTeam().map(m => m.creatureId)).toEqual([2, 1])

      // ◀ from ALL is TEAM, where A takes a member off.
      await userEvent.click(control('ArrowLeft'))
      expect(tab('Team 2/6')).toHaveAttribute('aria-selected', 'true')
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /Britney/ })).toHaveFocus()
      )
      await userEvent.click(control('A'))
      expect(savedTeam().map(m => m.creatureId)).toEqual([1])

      await userEvent.click(control('Start'))
      await expectMessage('A wild Britney appeared!')
    })

    it('shows the picker when a ▶ Battle creature is not on file', async () => {
      stubFetch()
      renderWithClient(<BattleScreen playerId={5000} rng={alwaysZero} />)
      expect(
        await screen.findByRole('group', { name: 'Choose your team' })
      ).toBeInTheDocument()
    })

    it('changes the team after a battle', async () => {
      await open(1)
      await userEvent.click(screen.getByRole('button', { name: 'Run' }))
      await readUntil('Got away safely!')
      // Enter past the last message to the end screen.
      while (!screen.queryByRole('button', { name: 'Change team' })) {
        await userEvent.keyboard('{Enter}')
      }
      await userEvent.click(screen.getByRole('button', { name: 'Change team' }))
      expect(tab('Team 1/6')).toHaveAttribute('aria-selected', 'true')
      await userEvent.click(await row(/Geovanni/))
      expect(savedTeam()).toEqual([])
      await userEvent.click(tab('all'))
      await userEvent.click(await row(/Hershel/))
      await userEvent.click(screen.getByRole('button', { name: 'Start' }))
      await expectMessage(/A wild .+ appeared!/)
      expect(savedTeam().map(m => m.creatureId)).toEqual([3])
    })
  })
})

describe('parsePlayerId', () => {
  it.each([
    ['?id=12', 12],
    ['?id=0', null],
    ['?id=abc', null],
    ['', null]
  ])('%s → %s', (search, expected) => {
    expect(parsePlayerId(search)).toBe(expected)
  })
})
