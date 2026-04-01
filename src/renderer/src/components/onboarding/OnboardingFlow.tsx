import React, { useState } from 'react'
import { BusinessNameStep } from './BusinessNameStep'
import { SlugStep } from './SlugStep'
import { BrandingStep } from './BrandingStep'
import { ReadyScreen } from './ReadyScreen'
import { createBusiness, type Business } from '../../lib/auth'

type Step = 'business-name' | 'slug' | 'branding' | 'ready'

interface OnboardingFlowProps {
  user: any
  onComplete: (business: Business) => void
}

const STEPS: Step[] = ['business-name', 'slug', 'branding']

export function OnboardingFlow({ user, onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState<Step>('business-name')
  const [businessName, setBusinessName] = useState('')
  const [slug, setSlug] = useState('')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [websiteUrl, setWebsiteUrl] = useState<string | null>(null)
  const [createdBusiness, setCreatedBusiness] = useState<Business | null>(null)

  const currentStepIndex = STEPS.indexOf(step)

  async function handleBrandingNext(logo: string | null, website: string | null) {
    setLogoUrl(logo)
    setWebsiteUrl(website)

    const { business, error } = await createBusiness({
      business_name: businessName,
      slug,
      logo_url: logo,
      website_url: website,
    })

    if (error) {
      console.error('Failed to create business:', error)
      return
    }

    if (business) {
      setCreatedBusiness(business)
      setStep('ready')
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: '#0a0a0f',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      }}
    >
      {/* Progress dots */}
      {step !== 'ready' && (
        <div
          style={{
            position: 'absolute',
            top: 48,
            display: 'flex',
            gap: 8,
          }}
        >
          {STEPS.map((s, i) => (
            <div
              key={s}
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: i <= currentStepIndex ? '#6366f1' : 'rgba(255,255,255,.15)',
                transition: 'background-color 0.3s ease',
              }}
            />
          ))}
        </div>
      )}

      {/* Step content */}
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          padding: '0 24px',
          transition: 'opacity 0.25s ease',
        }}
      >
        {step === 'business-name' && (
          <BusinessNameStep
            onNext={(name, generatedSlug) => {
              setBusinessName(name)
              setSlug(generatedSlug)
              setStep('slug')
            }}
          />
        )}
        {step === 'slug' && (
          <SlugStep
            businessName={businessName}
            initialSlug={slug}
            onNext={(finalSlug) => {
              setSlug(finalSlug)
              setStep('branding')
            }}
            onBack={() => setStep('business-name')}
          />
        )}
        {step === 'branding' && (
          <BrandingStep
            onNext={handleBrandingNext}
            onBack={() => setStep('slug')}
          />
        )}
        {step === 'ready' && (
          <ReadyScreen
            businessName={businessName}
            slug={slug}
            onEnter={() => {
              if (createdBusiness) onComplete(createdBusiness)
            }}
          />
        )}
      </div>
    </div>
  )
}
