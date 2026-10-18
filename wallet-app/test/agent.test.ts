import { describe, expect, it } from 'vitest'
import { HEARTBEAT_CODE, heartbeatPayload, messageOf, presence, signPayload, startHeartbeats } from '../src/agent'

const PRIV = '0x1ab42cc412b618bdea3a599e3c9bae199ebf030895b039e9db1e30dafb12b727' as const

describe('heartbeat', () => {
  it('always sends code ONLINE', async () => {
    const payload = heartbeatPayload(PRIV, 2, 1_700_000_000_000, '0.1.0')
    expect(HEARTBEAT_CODE).toBe('ONLINE')
    expect((payload.body as { code: string }).code).toBe('ONLINE')
    const signed = await signPayload(PRIV, payload)
    expect((signed.payload.body as { code: string }).code).toBe('ONLINE')
    expect(messageOf(signed.payload)).toContain('"code":"ONLINE"')
  })

  it('is offline unless the tab is open, visible, and registered', () => {
    expect(presence({ registered: true, visible: true, running: true })).toBe('online')
    expect(presence({ registered: true, visible: false, running: true })).toBe('offline')
    expect(presence({ registered: false, visible: true, running: true })).toBe('offline')
    expect(presence({ registered: true, visible: true, running: false })).toBe('offline')
  })

  it('does not beat while hidden', async () => {
    let visible = true
    let beats = 0
    let last: 'online' | 'offline' = 'offline'
    const ctl = startHeartbeats({
      intervalMs: 1000,
      isVisible: () => visible,
      isRegistered: () => true,
      beat: async () => {
        beats += 1
      },
      onPresence: (p) => {
        last = p
      },
      setTimer: () => 1,
      clearTimer: () => {},
    })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(beats).toBeGreaterThan(0)
    expect(last).toBe('online')
    const seen = beats
    visible = false
    ctl.poke()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(ctl.presence()).toBe('offline')
    expect(beats).toBe(seen)
    ctl.stop()
    expect(ctl.presence()).toBe('offline')
  })
})
