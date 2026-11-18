'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowRight, Check, FileText, Search } from 'lucide-react'
import { isAuthenticated } from '@/lib/auth'
import Logo from '@/components/shared/Logo'

/* ────────────────────────────────────────────────────────────
   Content lives up here so copy edits don't mean digging in JSX.
   ──────────────────────────────────────────────────────────── */

const AUDIENCES = [
  {
    who: 'Law firms',
    line: 'Matter files, engagement letters, executed agreements.',
    ask: 'Which of our NDAs with vendors auto-renew this year?',
  },
  {
    who: 'CA & accounting practices',
    line: 'GST returns, audit workpapers, client KYC.',
    ask: 'Show Q1 GST filings for clients in Ahmedabad.',
  },
  {
    who: 'Clinics & healthcare',
    line: 'Patient records, consent forms, lab reports.',
    ask: 'Find consent forms signed before the new policy.',
  },
]

const STEPS = [
  {
    title: 'Drop the files in',
    body: 'PDFs, Word, Excel, scans and photos of paper documents. Folders from Google Drive can be synced instead of uploaded by hand.',
  },
  {
    title: 'They are locked before they are stored',
    body: 'Each file is compressed, split into chunks and encrypted with its own AES-256 key before anything is written to storage. Every chunk gets a checksum, so tampering or corruption is caught on the way back out.',
  },
  {
    title: 'Avora reads them, on your servers',
    body: 'Text is pulled out (including from scans), the document is classified and indexed. The language model runs locally, so nothing is sent to a third-party AI service.',
  },
  {
    title: 'You ask in plain words',
    body: 'Search by what a document says, not what someone named it. Answers point back to the exact file and page so you can check the source.',
  },
]

const SECURITY = [
  ['Encryption at rest', 'AES-256-GCM, a separate key for every document'],
  ['Integrity',          'SHA-256 checksum on every chunk, checked on upload and download'],
  ['Where the AI runs',  'On your own infrastructure (Ollama), no outside API calls'],
  ['Access',             'Department and role based, down to a single document'],
  ['Audit trail',        'Every view, download, share and delete — who, when, from where'],
]

const PLANS = [
  {
    name: 'Starter', price: '₹0', note: 'Free, for trying it out',
    features: ['5 GB storage', 'Up to 100 documents', 'Encryption and audit log', 'Search', 'One user'],
    cta: 'Start free',
  },
  {
    name: 'Team', price: '₹2,499', note: 'per month, billed yearly', featured: true,
    features: ['500 GB storage', 'Unlimited documents', 'Copilot, compliance and contract review', 'Departments and roles', 'Up to 10 people', 'Version history'],
    cta: 'Start with Team',
  },
  {
    name: 'Organisation', price: 'Let’s talk', note: 'For larger or regulated teams',
    features: ['Unlimited storage and people', 'Installed on your own servers', 'Custom document types', 'Named contact for support'],
    cta: 'Contact us',
  },
]

const FAQ = [
  ['Can your team read our documents?', 'No. Files are encrypted before they are written to storage and the keys never leave your deployment. On the self-hosted plan we have no access to the servers at all.'],
  ['Does it work with scanned paper?', 'Yes. Scans and phone photos go through OCR, so a scanned invoice is just as searchable as a typed one.'],
  ['What happens to documents someone shouldn’t see?', 'Each document has a visibility level — private, specific people, a department, or the whole organisation. Search only ever returns what the person asking is allowed to open.'],
  ['Can we bring in what we already have?', 'You can bulk upload, or connect a Google Drive folder and let Avora pull files in and keep them in sync.'],
]

/* ──────────────────────────────────────────────────────────── */

export default function LandingPage() {
  const [signedIn, setSignedIn] = useState(false)
  useEffect(() => { setSignedIn(isAuthenticated()) }, [])

  return (
    <div className="min-h-screen bg-[#F7F5F0] text-[#0E0D0A]">
      <SiteNav signedIn={signedIn} />
      <Hero signedIn={signedIn} />
      <Audiences />
      <HowItWorks />
      <Security />
      <Teams />
      <Pricing />
      <Faq />
      <Closing signedIn={signedIn} />
      <Footer />
    </div>
  )
}

function SiteNav({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-[#DDD9D0]/80 bg-[#F7F5F0]/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-page items-center gap-8 px-5 sm:px-8">
        <Link href="/" aria-label="Avora home"><Logo /></Link>
        <nav className="hidden items-center gap-6 text-[14px] text-[#5A5750] md:flex">
          <a href="#how" className="hover:text-[#0E0D0A]">How it works</a>
          <a href="#security" className="hover:text-[#0E0D0A]">Security</a>
          <a href="#teams" className="hover:text-[#0E0D0A]">For teams</a>
          <a href="#pricing" className="hover:text-[#0E0D0A]">Pricing</a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {signedIn ? (
            <Link href="/dashboard" className="inline-flex h-9 items-center gap-1.5 rounded-[8px] bg-[#0E0D0A] px-4 text-[14px] font-medium text-[#F7F5F0] hover:bg-[#2B2924]">
              Open workspace <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <>
              <Link href="/login" className="hidden h-9 items-center rounded-[8px] px-3 text-[14px] text-[#2B2924] hover:bg-[#ECEAE4] sm:inline-flex">Sign in</Link>
              <Link href="/register" className="inline-flex h-9 items-center rounded-[8px] bg-[#0E0D0A] px-4 text-[14px] font-medium text-[#F7F5F0] hover:bg-[#2B2924]">Get started</Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

function Hero({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="mx-auto max-w-page px-5 pb-20 pt-16 sm:px-8 lg:pt-24">
      <div className="grid grid-cols-1 items-start gap-14 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <p className="mb-5 text-[14px] text-[#5A5750]">Document storage for firms that handle other people’s paperwork</p>
          <h1 className="font-display text-[40px] font-semibold leading-[1.08] tracking-[-0.02em] sm:text-[54px]">
            Keep every file locked.<br className="hidden sm:block" /> Find any of them in seconds.
          </h1>
          <p className="mt-6 max-w-[34rem] text-[17px] leading-[1.65] text-[#5A5750]">
            Avora encrypts your contracts, filings and records, then lets your team search them by what they
            actually say. The AI runs on your own servers, so documents never leave the building.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              href={signedIn ? '/dashboard' : '/register'}
              className="inline-flex h-11 items-center gap-2 rounded-[8px] bg-[#0E0D0A] px-5 text-[15px] font-medium text-[#F7F5F0] hover:bg-[#2B2924]"
            >
              {signedIn ? 'Open your workspace' : 'Create a free vault'} <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="#how" className="inline-flex h-11 items-center px-3 text-[15px] text-[#2B2924] underline decoration-[#BDB8AC] underline-offset-4 hover:decoration-[#0E0D0A]">
              See how it works
            </a>
          </div>
          <p className="mt-6 text-[13px] text-[#8A877F]">No card needed. The free plan keeps 100 documents.</p>
        </div>

        <HeroPreview />
      </div>
    </section>
  )
}

/** A static slice of the real search screen — what a user actually sees after asking a question. */
function HeroPreview() {
  const results = [
    { name: 'Vendor_NDA_Kestrel_Logistics.pdf', meta: 'Contract · p. 4', quote: '…shall automatically renew for successive one (1) year terms unless either party gives sixty (60) days notice…' },
    { name: 'MSA_Northwind_2025_signed.pdf', meta: 'Contract · p. 11', quote: '…this Agreement renews on 1 April 2026 unless terminated in writing…' },
  ]
  return (
    <div className="relative">
      <div className="rounded-[14px] border border-[#DDD9D0] bg-white shadow-lg">
        <div className="flex items-center gap-2 border-b border-[#ECEAE4] px-4 py-3">
          <Search className="h-4 w-4 text-[#8A877F]" strokeWidth={1.75} />
          <span className="text-[14px] text-[#0E0D0A]">vendor contracts that auto-renew this year</span>
        </div>
        <div className="px-4 pb-2 pt-3 text-[12.5px] text-[#8A877F]">2 documents · searched 1,284 files</div>
        <ul>
          {results.map(r => (
            <li key={r.name} className="border-t border-[#F1EFEA] px-4 py-3.5">
              <div className="flex items-center gap-2.5">
                <FileText className="h-4 w-4 shrink-0 text-[#B91C1C]" strokeWidth={1.75} />
                <span className="truncate text-[13.5px] font-medium">{r.name}</span>
                <span className="ml-auto shrink-0 text-[12px] text-[#8A877F]">{r.meta}</span>
              </div>
              <p className="mt-1.5 pl-[26px] text-[13px] leading-[1.55] text-[#5A5750]">
                {r.quote.split(/(automatically renew|renews on 1 April 2026)/).map((part, i) =>
                  i % 2 ? <mark key={i} className="rounded-[2px] bg-[#FDF0C4] px-0.5 text-[#0E0D0A]">{part}</mark> : part
                )}
              </p>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2 border-t border-[#ECEAE4] bg-[#FBFAF7] px-4 py-3 text-[12.5px] text-[#5A5750]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#16A34A]" />
          Only showing files you have access to
        </div>
      </div>
      <p className="mt-3 text-center text-[12.5px] text-[#8A877F] lg:text-left">Example search. File names are illustrative.</p>
    </div>
  )
}

function Audiences() {
  return (
    <section className="border-y border-[#DDD9D0] bg-white">
      <div className="mx-auto grid max-w-page divide-y divide-[#ECEAE4] px-5 sm:px-8 md:grid-cols-3 md:divide-x md:divide-y-0">
        {AUDIENCES.map(a => (
          <div key={a.who} className="py-8 md:px-8 md:first:pl-0 md:last:pr-0">
            <h3 className="text-[15px] font-semibold">{a.who}</h3>
            <p className="mt-1 text-[14px] text-[#5A5750]">{a.line}</p>
            <p className="mt-4 border-l-2 border-[#1A3DAF]/40 pl-3 text-[14px] italic text-[#2B2924]">“{a.ask}”</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function HowItWorks() {
  return (
    <section id="how" className="mx-auto max-w-page scroll-mt-20 px-5 py-24 sm:px-8">
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <h2 className="font-display text-[34px] font-semibold leading-tight tracking-[-0.015em]">What happens to a file after you upload it</h2>
          <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-[#5A5750]">
            Four steps, all automatic. Most documents are searchable within a minute; very large scans take a little longer.
          </p>
        </div>
        <ol className="space-y-0">
          {STEPS.map((s, i) => (
            <li key={s.title} className="grid grid-cols-[44px_minmax(0,1fr)] gap-4 border-t border-[#DDD9D0] py-7 last:border-b">
              <span className="font-display text-[22px] text-[#8A877F] tabular-nums">{i + 1}</span>
              <div>
                <h3 className="text-[17px] font-semibold">{s.title}</h3>
                <p className="mt-2 max-w-xl text-[15px] leading-[1.65] text-[#5A5750]">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function Security() {
  return (
    <section id="security" className="scroll-mt-16 bg-[#0E0D0A] text-[#F7F5F0]">
      <div className="mx-auto grid max-w-page gap-12 px-5 py-24 sm:px-8 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <h2 className="font-display text-[34px] font-semibold leading-tight tracking-[-0.015em]">The specifics, for whoever signs off on security</h2>
          <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-[#F7F5F0]/60">
            Exactly what protects your files today, stated plainly so your reviewer can check it.
          </p>
        </div>
        <dl className="divide-y divide-white/10 border-y border-white/10">
          {SECURITY.map(([k, v]) => (
            <div key={k} className="grid gap-1 py-4 sm:grid-cols-[200px_1fr] sm:gap-6">
              <dt className="text-[14px] text-[#F7F5F0]/55">{k}</dt>
              <dd className="text-[15px]">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}

function Teams() {
  const levels = [
    ['Private', 'Only the person who uploaded it'],
    ['Shared', 'Specific people you name'],
    ['Department', 'Everyone in the team, plus the people they report to'],
    ['Organisation', 'Anyone in the company'],
  ]
  return (
    <section id="teams" className="mx-auto max-w-page scroll-mt-20 px-5 py-24 sm:px-8">
      <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-[34px] font-semibold leading-tight tracking-[-0.015em]">Set up the way your firm is actually organised</h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[#5A5750]">
            Create departments, give people roles, and let seniority decide who sees what. A partner can open their
            team’s files; a new joiner sees only what has been shared with them. Nobody has to manage folders of permissions.
          </p>
          <ul className="mt-7 space-y-2.5 text-[15px] text-[#2B2924]">
            {['Departments that can sit inside each other', 'Ten seniority levels, from executive to observer', 'Every access change written to the audit log'].map(t => (
              <li key={t} className="flex gap-2.5"><Check className="mt-1 h-4 w-4 shrink-0 text-[#1A3DAF]" />{t}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-[14px] border border-[#DDD9D0] bg-white">
          <div className="border-b border-[#ECEAE4] px-5 py-3.5 text-[14px] font-semibold">Who can open this document?</div>
          <ul>
            {levels.map(([name, desc], i) => (
              <li key={name} className="flex items-center gap-3 border-b border-[#F1EFEA] px-5 py-3.5 last:border-0">
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${i === 2 ? 'border-[#1A3DAF]' : 'border-[#C9C4B9]'}`}>
                  {i === 2 && <span className="h-2 w-2 rounded-full bg-[#1A3DAF]" />}
                </span>
                <span className="w-28 shrink-0 text-[14px] font-medium">{name}</span>
                <span className="text-[13.5px] text-[#5A5750]">{desc}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-16 border-t border-[#DDD9D0] bg-white">
      <div className="mx-auto max-w-page px-5 py-24 sm:px-8">
        <h2 className="font-display text-[34px] font-semibold tracking-[-0.015em]">Pricing</h2>
        <p className="mt-2 text-[15px] text-[#5A5750]">Priced per workspace, not per search. AI use is included because it runs on your hardware.</p>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {PLANS.map(p => (
            <div key={p.name} className={`flex flex-col rounded-[14px] border p-7 ${p.featured ? 'border-[#0E0D0A] bg-[#F7F5F0]' : 'border-[#DDD9D0]'}`}>
              <div className="flex items-center justify-between">
                <h3 className="text-[16px] font-semibold">{p.name}</h3>
                {p.featured && <span className="text-[12.5px] text-[#5A5750]">Most teams pick this</span>}
              </div>
              <div className="mt-4 font-display text-[38px] font-semibold leading-none">{p.price}</div>
              <div className="mt-2 text-[13.5px] text-[#8A877F]">{p.note}</div>
              <ul className="mt-6 flex-1 space-y-2.5 border-t border-[#ECEAE4] pt-6">
                {p.features.map(f => (
                  <li key={f} className="flex gap-2.5 text-[14px] text-[#2B2924]"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#8A877F]" />{f}</li>
                ))}
              </ul>
              <Link
                href="/register"
                className={`mt-8 inline-flex h-10 items-center justify-center rounded-[8px] text-[14px] font-medium ${p.featured ? 'bg-[#0E0D0A] text-[#F7F5F0] hover:bg-[#2B2924]' : 'border border-[#DDD9D0] hover:border-[#0E0D0A]'}`}
              >
                {p.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Faq() {
  return (
    <section className="mx-auto max-w-page px-5 py-24 sm:px-8">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <h2 className="font-display text-[34px] font-semibold tracking-[-0.015em]">Questions we get asked</h2>
        <div className="border-t border-[#DDD9D0]">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group border-b border-[#DDD9D0]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[16px] font-medium [&::-webkit-details-marker]:hidden">
                {q}
                <span className="text-[20px] font-light text-[#8A877F] transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="max-w-xl pb-6 text-[15px] leading-[1.65] text-[#5A5750]">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

function Closing({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="border-t border-[#DDD9D0]">
      <div className="mx-auto flex max-w-page flex-col items-start justify-between gap-6 px-5 py-16 sm:px-8 md:flex-row md:items-center">
        <div>
          <h2 className="font-display text-[28px] font-semibold tracking-[-0.01em]">Start with the documents you worry about most.</h2>
          <p className="mt-2 text-[15px] text-[#5A5750]">Upload a handful, search them, and decide from there.</p>
        </div>
        <Link
          href={signedIn ? '/dashboard' : '/register'}
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-[8px] bg-[#0E0D0A] px-5 text-[15px] font-medium text-[#F7F5F0] hover:bg-[#2B2924]"
        >
          {signedIn ? 'Open your workspace' : 'Create a free vault'} <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-[#DDD9D0] bg-[#F1EFEA]">
      <div className="mx-auto flex max-w-page flex-col gap-6 px-5 py-10 text-[13.5px] text-[#5A5750] sm:px-8 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Logo size="sm" />
          <span className="text-[#8A877F]">© {new Date().getFullYear()} Avora</span>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2">
          <a href="#security" className="hover:text-[#0E0D0A]">Security</a>
          <a href="#pricing" className="hover:text-[#0E0D0A]">Pricing</a>
          <Link href="/login" className="hover:text-[#0E0D0A]">Sign in</Link>
          <Link href="/register" className="hover:text-[#0E0D0A]">Create an account</Link>
        </nav>
      </div>
    </footer>
  )
}
