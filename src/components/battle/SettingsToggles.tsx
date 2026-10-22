import { buttonClass } from '@/components/ui/button'
import { type useFullscreen } from '@/hooks/useFullscreen'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import { useSettings } from '@/hooks/useSettings'
import { unlockAudio } from '@/lib/sound'

// Sound (off until asked for) and the timing bar (on, unless reduced motion).
// `timingAlwaysOn`: a friend battle, where the bar runs whatever the setting.
export function SettingsToggles({
  fullscreen,
  timingAlwaysOn = false
}: {
  fullscreen: ReturnType<typeof useFullscreen>
  timingAlwaysOn?: boolean
}) {
  const [settings, setSettings] = useSettings()
  const reduced = usePrefersReducedMotion()
  const timingOn = !reduced && (timingAlwaysOn || settings.timing)
  const toggleClass = (pressed: boolean) =>
    buttonClass(pressed ? 'primary' : 'secondary', 'h-10 gap-1.5 px-3')
  return (
    <div
      aria-label="Battle settings"
      className="flex flex-wrap gap-2"
      role="group"
    >
      {fullscreen.supported && (
        <button
          className={toggleClass(false)}
          onClick={() => void fullscreen.toggle()}
          type="button"
        >
          <span aria-hidden>⛶</span>
          Full screen
        </button>
      )}
      <button
        aria-pressed={settings.sound}
        className={toggleClass(settings.sound)}
        onClick={() => {
          // Browsers allow audio only after a user gesture: this is it.
          unlockAudio()
          setSettings(current => ({ ...current, sound: !current.sound }))
        }}
        type="button"
      >
        <span aria-hidden>{settings.sound ? '🔊' : '🔇'}</span>
        Sound
      </button>
      <button
        aria-pressed={timingOn}
        className={toggleClass(timingOn)}
        disabled={reduced || timingAlwaysOn}
        onClick={() =>
          setSettings(current => ({ ...current, timing: !current.timing }))
        }
        title={
          reduced
            ? 'Off while reduced motion is on'
            : timingAlwaysOn
              ? 'Always on in friend battles'
              : undefined
        }
        type="button"
      >
        <span aria-hidden>⏱</span>
        Timing
      </button>
      <button
        aria-pressed={settings.classic}
        className={toggleClass(settings.classic)}
        onClick={() =>
          setSettings(current => ({ ...current, classic: !current.classic }))
        }
        title="The battle screen in four greens"
        type="button"
      >
        <span
          aria-hidden
          className="size-3 border-2 border-current bg-[#8bac0f]"
        />
        Classic
      </button>
    </div>
  )
}
