// First-time user onboarding modal for terminal key bar features

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { ChevronRight, Zap, Hand, Settings, HelpCircle } from 'lucide-react'

export function OnboardingModal() {
  const { hasSeenMainOnboarding, markMainOnboardingAsSeen } = useOnboardingStore()
  const [currentStep, setCurrentStep] = useState(0)

  // Determine if modal should be open based on onboarding state
  const open = !hasSeenMainOnboarding

  const handleClose = () => {
    markMainOnboardingAsSeen()
  }

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      handleClose()
    }
  }

  const steps = [
    {
      title: 'Welcome to Terminal Key Bar',
      description: 'Quick shortcuts for mobile terminal control',
      icon: <Zap className="w-12 h-12 text-blue-600 dark:text-blue-400" />,
      content: (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The terminal key bar provides essential keyboard shortcuts optimized for mobile devices.
          </p>
          <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <span className="text-blue-600 dark:text-blue-400 font-bold">→</span>
              <span>Tap keys to send input to your terminal</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-blue-600 dark:text-blue-400 font-bold">→</span>
              <span>Customize the key bar layout to your needs</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-blue-600 dark:text-blue-400 font-bold">→</span>
              <span>Save frequently used commands</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Modifier Keys',
      description: 'Use CTRL and ALT keys with terminal shortcuts',
      icon: <Hand className="w-12 h-12 text-amber-600 dark:text-amber-400" />,
      content: (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Control and Alt keys work like on a physical keyboard.
          </p>
          <div className="bg-muted/50 rounded-lg p-4 space-y-3 text-sm">
            <div>
              <p className="font-medium text-sm mb-1">Single Tap (Sticky Mode)</p>
              <p className="text-xs text-muted-foreground">
                Activates the modifier for the next key press only. Auto-clears after 5 seconds.
              </p>
            </div>
            <div>
              <p className="font-medium text-sm mb-1">Double Tap (Lock Mode)</p>
              <p className="text-xs text-muted-foreground">
                Activates the modifier persistently. Tap again to unlock.
              </p>
            </div>
            <div>
              <p className="font-medium text-sm mb-1">Visual Feedback</p>
              <p className="text-xs text-muted-foreground">
                Highlighted keys show active modifiers. Pulsing border shows locked state.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Gesture Controls',
      description: 'Swipe and pinch to control the terminal',
      icon: <Hand className="w-12 h-12 text-purple-600 dark:text-purple-400" />,
      content: (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Mobile-friendly gestures for faster terminal navigation.
          </p>
          <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <span className="text-purple-600 dark:text-purple-400 font-bold">↑↓</span>
              <span>Swipe up/down on terminal for command history</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-purple-600 dark:text-purple-400 font-bold">←→</span>
              <span>Swipe left/right to move cursor (fast swipe moves by word)</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-purple-600 dark:text-purple-400 font-bold">✌️</span>
              <span>Two-finger swipe for Page Up/Down scrolling</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-purple-600 dark:text-purple-400 font-bold">🤌</span>
              <span>Pinch in/out to adjust terminal font size</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            All gestures can be disabled in Settings if you prefer traditional controls.
          </p>
        </div>
      ),
    },
    {
      title: 'Customization',
      description: 'Tailor the key bar to your workflow',
      icon: <Settings className="w-12 h-12 text-green-600 dark:text-green-400" />,
      content: (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Make the terminal key bar work for your needs.
          </p>
          <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <span className="text-green-600 dark:text-green-400 font-bold">📐</span>
              <span>Rearrange, add, or remove keys</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-600 dark:text-green-400 font-bold">💾</span>
              <span>Save custom layouts as presets</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-600 dark:text-green-400 font-bold">⚙️</span>
              <span>Save frequently used commands with one tap</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-600 dark:text-green-400 font-bold">🎚️</span>
              <span>Configure gesture sensitivity to your preference</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Getting Help',
      description: 'Learn more about any feature',
      icon: <HelpCircle className="w-12 h-12 text-cyan-600 dark:text-cyan-400" />,
      content: (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Detailed guides are available throughout the app.
          </p>
          <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <span className="text-cyan-600 dark:text-cyan-400 font-bold">?</span>
              <span>Look for help icons next to settings for explanations</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-cyan-600 dark:text-cyan-400 font-bold">ℹ️</span>
              <span>Visit Settings → Gesture Controls for comprehensive documentation</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-cyan-600 dark:text-cyan-400 font-bold">💡</span>
              <span>First-time hints appear when you use new features</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            You can re-enable this onboarding anytime from the help menu.
          </p>
        </div>
      ),
    },
  ]

  const step = steps[currentStep]

  return (
    <Dialog open={open} onOpenChange={markMainOnboardingAsSeen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex justify-center mb-4">{step.icon}</div>
          <DialogTitle className="text-center text-lg">{step.title}</DialogTitle>
          <DialogDescription className="text-center">{step.description}</DialogDescription>
        </DialogHeader>

        <div className="py-4">{step.content}</div>

        <DialogFooter className="gap-2 sm:gap-0">
          <div className="flex items-center justify-between w-full sm:w-auto">
            <div className="flex gap-1">
              {steps.map((_, idx) => (
                <div
                  key={idx}
                  className={`h-2 rounded-full transition-all ${
                    idx === currentStep ? 'w-6 bg-primary' : 'w-2 bg-muted'
                  }`}
                />
              ))}
            </div>
            <div className="text-xs text-muted-foreground ml-2">
              {currentStep + 1} / {steps.length}
            </div>
          </div>
        </DialogFooter>

        <div className="flex gap-2 mt-4">
          <Button variant="outline" onClick={handleClose} className="flex-1">
            Skip
          </Button>
          <Button onClick={handleNext} className="flex-1">
            {currentStep === steps.length - 1 ? 'Done' : 'Next'}
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
