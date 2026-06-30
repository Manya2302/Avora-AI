'use client'
import { useRouter } from 'next/navigation'
import { Shield, Search, FileText, Lock, ClipboardList, Zap, CheckCircle2 } from 'lucide-react'

const FEATURES = [
  { icon: Lock,         title: 'AES-256-GCM Encryption',  desc: 'Every document gets its own unique key. RSA-4096 wrapped. Zero shared keys.' },
  { icon: Search,       title: 'Orivo Semantic Search',    desc: 'Find documents by meaning, not keywords. "GST return from March" finds the right file even with no match in filename.' },
  { icon: FileText,     title: 'Auto Classification',      desc: 'Orivo reads and classifies every document — invoices, contracts, tax filings, medical records — automatically.' },
  { icon: ClipboardList,title: 'Immutable Audit Trail',    desc: 'Every action logged with user, timestamp, and IP. Ready for compliance audits at any moment.' },
  { icon: Zap,          title: 'On-Premise AI (Orivo)',    desc: 'Zero API costs. Orivo runs entirely on your servers via Ollama. No data leaves your environment.' },
  { icon: Shield,       title: '8 Security Layers',        desc: 'ZSTD compression, chunking, AES-256, RSA-4096, SHA-256 integrity, metadata isolation, versioning, and audit logs.' },
]
const HOW = [
  { n: '01', title: 'Upload',                desc: 'Drop any file up to 5 GB. PDF, DOCX, XLSX, images.' },
  { n: '02', title: 'Compress & Encrypt',    desc: 'ZSTD level 9 compression, then AES-256-GCM with a unique key per document.' },
  { n: '03', title: 'Orivo Understands',     desc: 'PaddleOCR extracts text. Orivo classifies, tags, summarises, and indexes it semantically.' },
  { n: '04', title: 'Retrieve by Meaning',   desc: 'Search in plain English. No filename knowledge required. Ever.' },
]
const COMPARE = [
  { feature: 'File Storage',                sv: true,  gd: true,  db: true  },
  { feature: 'End-to-End Encryption',       sv: true,  gd: false, db: false },
  { feature: 'Zero-Knowledge Architecture', sv: true,  gd: false, db: false },
  { feature: 'AI Document Understanding',   sv: true,  gd: false, db: false },
  { feature: 'Semantic Natural Language Search', sv: true, gd: false, db: false },
  { feature: 'Auto Classification & Tagging', sv: true, gd: false, db: false },
  { feature: 'Compliance Audit Logs',       sv: true,  gd: false, db: false },
  { feature: 'On-Premise AI (No API Costs)',sv: true,  gd: false, db: false },
]
const PLANS = [
  { name:'Free',         price:'₹0',      period:'Forever free',            popular:false, features:['5 GB storage','100 documents','AES-256 encryption','Basic Orivo search','30-day audit logs','1 user'] },
  { name:'Professional', price:'₹2,499',  period:'/ month · billed annually',popular:true, features:['500 GB storage','Unlimited documents','Full 8-layer security','Orivo AI — full intelligence','Auto classification','Up to 10 users','Priority support','Version control'] },
  { name:'Enterprise',   price:'Custom',  period:'Tailored to your org',    popular:false, features:['Unlimited storage','Unlimited users','On-premise deployment','Custom Orivo models','Dedicated CSM','99.9% SLA','Compliance reports'] },
]

export default function LandingPage() {
  const router = useRouter()
  return (
    <div className="min-h-screen bg-[#F7F5F0]">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-[#F7F5F0]/90 backdrop-blur-md border-b border-[#DDD9D0]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center gap-8">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-[#0E0D0A] rounded-[7px] flex items-center justify-center"><Shield className="w-3.5 h-3.5 text-white" /></div>
            <span className="font-display font-bold text-[17px] text-[#0E0D0A]">SecureVault <span className="text-[#1A3DAF]">AI</span></span>
            <span className="font-mono text-[8.5px] text-[#1A3DAF] bg-[#EBF0FF] px-1.5 py-0.5 rounded-full border border-[#1A3DAF]/15">by Orivo</span>
          </div>
          <div className="hidden md:flex items-center gap-7 ml-4">
            {['Features','Security','Pricing'].map(l => <a key={l} href={`#${l.toLowerCase()}`} className="text-[13.5px] text-[#5A5750] hover:text-[#0E0D0A] transition-colors">{l}</a>)}
          </div>
          <div className="ml-auto flex gap-3">
            <button onClick={() => router.push('/login')} className="px-4 py-1.5 text-[13px] font-medium text-[#5A5750] border border-[#DDD9D0] rounded-[7px] hover:bg-white hover:text-[#0E0D0A] transition-all">Log in</button>
            <button onClick={() => router.push('/register')} className="px-4 py-1.5 text-[13px] font-medium bg-[#0E0D0A] text-[#F7F5F0] rounded-[7px] hover:bg-[#252318] transition-all">Get Started</button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <div className="inline-flex items-center gap-2 font-mono text-[10px] text-[#1A3DAF] bg-[#EBF0FF] border border-[#1A3DAF]/12 px-3 py-1.5 rounded-full mb-7">
              <span className="w-1.5 h-1.5 bg-[#1A3DAF] rounded-full animate-pulse" /> Orivo-Powered Document Intelligence
            </div>
            <h1 className="font-display text-5xl lg:text-6xl font-bold leading-[1.08] tracking-[-2px] text-[#0E0D0A] mb-6">
              Your Documents.<br/><em className="text-[#1A3DAF]">Encrypted.</em><br/>Intelligent.
            </h1>
            <p className="text-[17px] font-light text-[#5A5750] leading-[1.72] mb-10 max-w-lg">
              Store, secure and find critical business documents using Orivo AI-powered retrieval and enterprise-grade encryption. Built for law firms, CA firms, and healthcare.
            </p>
            <div className="flex gap-3 mb-10">
              <button onClick={() => router.push('/register')} className="flex items-center gap-2 px-6 py-3.5 bg-[#0E0D0A] text-[#F7F5F0] rounded-[10px] text-[15px] font-medium hover:bg-[#252318] transition-all hover:shadow-lg hover:-translate-y-0.5">
                <Zap className="w-4 h-4" /> Get Started Free
              </button>
              <a href="#features" className="px-6 py-3.5 border border-[#DDD9D0] rounded-[10px] text-[15px] font-light text-[#5A5750] hover:border-[#9B9890] hover:text-[#0E0D0A] transition-all">See how it works →</a>
            </div>
            <div className="flex flex-wrap gap-5 text-sm text-[#9B9890]">
              {['AES-256-GCM','RSA-4096','Zero-Knowledge','SOC2 Ready'].map(t => (
                <div key={t} className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-[#1A3DAF]" />{t}</div>
              ))}
            </div>
          </div>
          <div className="bg-white border border-[#DDD9D0] rounded-[20px] p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-[10px] font-medium tracking-[1px] uppercase text-[#9B9890]">Secure Vault · Orivo</span>
              <span className="flex items-center gap-1.5 font-mono text-[9.5px] text-green-600 bg-green-50 border border-green-100 px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" /> All systems operational
              </span>
            </div>
            {['GST_Return_Q1_2026.pdf · Tax Filing · 2.4 MB','Client_Agreement_Mehta.docx · Contract · 890 KB','Audit_Report_FY2025.xlsx · Audit · 5.1 MB','Medical_Record_Patient_8823.pdf · Medical · 780 KB'].map((f, i) => {
              const [name, cat, size] = f.split(' · ')
              const colors = ['bg-red-50 text-red-600','bg-blue-50 text-blue-600','bg-green-50 text-green-600','bg-red-50 text-red-600']
              const exts = ['PDF','DOC','XLS','PDF']
              return (
                <div key={i} className="flex items-center gap-3 p-2.5 bg-[#F7F5F0] border border-[#ECEAE4] rounded-[9px] mb-2 last:mb-0">
                  <div className={`w-8 h-8 rounded-[7px] flex items-center justify-center font-mono text-[9px] font-bold flex-shrink-0 ${colors[i]}`}>{exts[i]}</div>
                  <div className="flex-1 min-w-0"><div className="text-[12.5px] font-medium text-[#0E0D0A] truncate">{name}</div><div className="font-mono text-[10px] text-[#9B9890]">{cat} · {size}</div></div>
                  <div className="flex gap-1.5"><span className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#EBF0FF] text-[#1A3DAF]">ENC</span><span className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-600">AI</span></div>
                </div>
              )
            })}
            <div className="flex items-center gap-2 p-2.5 bg-[#F7F5F0] border border-[#ECEAE4] rounded-[9px] mt-3">
              <Search className="w-3.5 h-3.5 text-[#1A3DAF] flex-shrink-0" />
              <span className="text-[12.5px] text-[#9B9890] font-light italic">Find all GST returns from last quarter…</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-white border-y border-[#DDD9D0] py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-end mb-14">
            <div>
              <span className="font-mono text-[10px] tracking-[2.5px] uppercase text-[#1A3DAF] block mb-3">What we do</span>
              <h2 className="font-display text-5xl font-bold tracking-[-1.5px] text-[#0E0D0A] leading-[1.1]">Not storage.<br/><em className="text-[#1A3DAF]">Intelligence.</em></h2>
            </div>
            <p className="text-[16px] font-light text-[#5A5750] leading-[1.72]">While traditional systems just store files, SecureVault AI powered by Orivo understands, classifies, and retrieves documents by meaning — not filenames.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => (
              <div key={f.title} className={`p-7 border rounded-[16px] ${i === 0 ? 'bg-[#0E0D0A] border-[#0E0D0A] text-[#F7F5F0]' : 'bg-[#F7F5F0] border-[#DDD9D0] hover:shadow-md'} transition-all`}>
                <div className={`w-10 h-10 rounded-[10px] flex items-center justify-center mb-5 ${i === 0 ? 'bg-white/10 border border-white/15' : 'bg-white border border-[#DDD9D0]'}`}>
                  <f.icon className={`w-5 h-5 ${i === 0 ? 'text-white/80' : 'text-[#1A3DAF]'}`} />
                </div>
                <h3 className="font-display text-[19px] font-semibold leading-tight mb-2.5">{f.title}</h3>
                <p className={`text-[13.5px] font-light leading-[1.65] ${i === 0 ? 'text-white/60' : 'text-[#5A5750]'}`}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 max-w-6xl mx-auto px-6">
        <div className="text-center mb-14">
          <span className="font-mono text-[10px] tracking-[2.5px] uppercase text-[#1A3DAF] block mb-3">The Process</span>
          <h2 className="font-display text-5xl font-bold tracking-[-1.5px] text-[#0E0D0A]">From upload to <em className="text-[#1A3DAF]">intelligent retrieval</em></h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-0 relative">
          <div className="hidden md:block absolute top-6 left-[15%] right-[15%] h-px bg-[#DDD9D0]" />
          {HOW.map(h => (
            <div key={h.n} className="flex flex-col items-center text-center px-6">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center font-display text-xl font-bold mb-5 relative z-10 border shadow-sm ${h.n === '03' ? 'bg-[#1A3DAF] border-[#1A3DAF] text-white' : 'bg-white border-[#DDD9D0] text-[#0E0D0A]'}`}>{h.n}</div>
              <h3 className="font-display text-[17px] font-semibold text-[#0E0D0A] mb-2">{h.title}</h3>
              <p className="text-[13px] font-light text-[#9B9890] leading-[1.6]">{h.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Security layers */}
      <section id="security" className="bg-[#0E0D0A] py-20 relative overflow-hidden">
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-[#1A3DAF]/12 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
            <div>
              <span className="font-mono text-[10px] tracking-[2.5px] uppercase text-[#7B9FE8] block mb-4">Architecture</span>
              <h2 className="font-display text-5xl font-bold tracking-[-1.5px] text-white/92 leading-[1.1] mb-5">8-Layer<br/><em className="text-[#7B9FE8]">Security</em><br/>Architecture</h2>
              <p className="text-[15px] font-light text-white/50 leading-[1.7] mb-8">We don't use a single algorithm. We layer complementary controls so breaking one layer is never enough.</p>
              <div className="flex gap-8">
                {[['256-bit','AES Key Size'],['4096-bit','RSA Key Size'],['10 MB','Chunk Size']].map(([n, l]) => (
                  <div key={l} className="border-l-2 border-white/12 pl-4">
                    <div className="font-display text-2xl font-bold text-white/90">{n}</div>
                    <div className="font-mono text-[10px] text-white/35 mt-0.5">{l}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-0.5">
              {[['01','Smart Compression','ZSTD Level 9'],['02','File Chunking','10 MB Chunks'],['03','AES-256-GCM','Per-Chunk Keys'],['04','RSA-4096 Key Wrap','Double Lock'],['05','SHA-256 Integrity','Per Chunk'],['06','Metadata Isolation','Obfuscated'],['07','Version Protection','Immutable'],['08','Audit Logging','Full Trail']].map(([n, title, chip]) => (
                <div key={n} className="flex items-center gap-4 px-5 py-3.5 rounded-[8px] hover:bg-white/4 border border-transparent hover:border-white/8 transition-all cursor-pointer group">
                  <span className="font-mono text-[10px] text-white/28 w-5">{n}</span>
                  <span className="text-[13.5px] font-medium text-white/85 flex-1">{title}</span>
                  <span className="font-mono text-[9px] text-[#7B9FE8] bg-[#1A3DAF]/20 border border-[#7B9FE8]/20 px-2 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">{chip}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="bg-white border-y border-[#DDD9D0] py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="font-mono text-[10px] tracking-[2.5px] uppercase text-[#1A3DAF] block mb-3">Why SecureVault</span>
            <h2 className="font-display text-5xl font-bold tracking-[-1.5px] text-[#0E0D0A]">More than <em className="text-[#1A3DAF]">storage.</em></h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border border-[#DDD9D0] rounded-[16px] overflow-hidden border-separate border-spacing-0">
              <thead><tr>
                <th className="px-5 py-3 text-left font-mono text-[10px] uppercase tracking-[0.6px] text-[#9B9890] bg-[#F7F5F0] border-b border-[#DDD9D0]">Capability</th>
                <th className="px-5 py-3 text-center font-semibold text-[13px] bg-[#F7F5F0] border-b border-[#DDD9D0] text-[#5A5750]">Google Drive</th>
                <th className="px-5 py-3 text-center font-semibold text-[13px] bg-[#F7F5F0] border-b border-[#DDD9D0] text-[#5A5750]">Dropbox</th>
                <th className="px-5 py-3 text-center font-semibold text-[13px] bg-[#0E0D0A] border-b border-[#0E0D0A] text-[#F7F5F0] font-display text-[14px]">SecureVault AI</th>
              </tr></thead>
              <tbody>{COMPARE.map(r => (
                <tr key={r.feature} className="hover:bg-[#F7F5F0]">
                  <td className="px-5 py-3 text-[13px] font-medium text-[#0E0D0A] border-b border-[#ECEAE4]">{r.feature}</td>
                  <td className="px-5 py-3 text-center border-b border-[#ECEAE4]">{r.gd ? <span className="text-green-500 text-base">✓</span> : <span className="text-red-400 text-base">✗</span>}</td>
                  <td className="px-5 py-3 text-center border-b border-[#ECEAE4]">{r.db ? <span className="text-green-500 text-base">✓</span> : <span className="text-red-400 text-base">✗</span>}</td>
                  <td className="px-5 py-3 text-center border-b border-[#ECEAE4] bg-[#1A3DAF]/2">{r.sv ? <span className="text-green-500 text-base font-bold">✓</span> : <span className="text-red-400 text-base">✗</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 max-w-6xl mx-auto px-6">
        <div className="text-center mb-14">
          <span className="font-mono text-[10px] tracking-[2.5px] uppercase text-[#1A3DAF] block mb-3">Pricing</span>
          <h2 className="font-display text-5xl font-bold tracking-[-1.5px] text-[#0E0D0A]">Simple, honest pricing</h2>
          <p className="text-[16px] font-light text-[#9B9890] mt-3">No hidden fees. No per-AI-query billing.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {PLANS.map(p => (
            <div key={p.name} className={`relative border rounded-[16px] p-9 transition-all hover:-translate-y-1 hover:shadow-lg ${p.popular ? 'border-[#0E0D0A] shadow-md' : 'border-[#DDD9D0] bg-white'}`}>
              {p.popular && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#0E0D0A] text-[#F7F5F0] font-mono text-[9px] font-semibold px-3 py-1 rounded-full uppercase tracking-wider whitespace-nowrap">Most Popular</div>}
              <div className="font-mono text-[10px] tracking-[1.8px] uppercase text-[#9B9890] mb-2.5">{p.name}</div>
              <div className="font-display text-5xl font-bold tracking-[-2px] text-[#0E0D0A] mb-1">{p.price}</div>
              <div className="text-[13px] text-[#9B9890] mb-6 pb-6 border-b border-[#ECEAE4]">{p.period}</div>
              <ul className="space-y-3 mb-8">
                {p.features.map(f => <li key={f} className="flex items-center gap-2.5 text-[13px] text-[#5A5750]"><div className="w-4 h-4 rounded-full bg-[#EBF0FF] border border-[#1A3DAF]/15 flex items-center justify-center flex-shrink-0"><CheckCircle2 className="w-2.5 h-2.5 text-[#1A3DAF]" /></div>{f}</li>)}
              </ul>
              <button onClick={() => router.push('/register')}
                className={`w-full py-2.5 rounded-[8px] text-[14px] font-medium transition-all ${p.popular ? 'bg-[#0E0D0A] text-[#F7F5F0] hover:bg-[#252318]' : 'bg-transparent border border-[#DDD9D0] text-[#5A5750] hover:border-[#0E0D0A] hover:text-[#0E0D0A]'}`}>
                {p.price === 'Custom' ? 'Contact sales' : 'Get started'}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#0E0D0A] py-24 relative overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-96 h-96 bg-[#1A3DAF]/15 rounded-full blur-3xl" />
        </div>
        <div className="max-w-3xl mx-auto px-6 text-center relative z-10">
          <h2 className="font-display text-6xl font-bold tracking-[-2px] text-white/92 leading-[1.08] mb-5">Documents that understand themselves. <em className="text-[#7B9FE8]">Finally.</em></h2>
          <p className="text-[17px] font-light text-white/45 mb-10">Start free. No credit card. Encrypted from your first upload.</p>
          <div className="flex gap-4 justify-center flex-wrap">
            <button onClick={() => router.push('/register')} className="px-8 py-4 bg-white text-[#0E0D0A] rounded-[10px] text-[15px] font-medium hover:bg-[#F7F5F0] transition-all hover:shadow-lg hover:-translate-y-0.5">Create your vault →</button>
            <button className="px-8 py-4 border border-white/15 rounded-[10px] text-[15px] font-light text-white/60 hover:border-white/35 hover:text-white transition-all">Talk to us</button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#0A0908] py-16 border-t border-white/5">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12 pb-12 border-b border-white/6">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 bg-white/7 rounded-[7px] flex items-center justify-center border border-white/10"><Shield className="w-3.5 h-3.5 text-white/70" /></div>
                <span className="font-display font-bold text-[16px] text-white/85">SecureVault <span className="text-[#7B9FE8]">AI</span></span>
              </div>
              <p className="text-[13px] font-light text-white/38 leading-[1.65] mb-4 max-w-xs">AI-Powered Zero-Knowledge Document Intelligence. Powered by Orivo.</p>
              <div className="flex gap-2 flex-wrap">
                {['AES-256','RSA-4096','Zero-Knowledge','Orivo'].map(b => <span key={b} className="font-mono text-[8.5px] font-medium px-2 py-0.5 rounded-full bg-white/5 border border-white/8 text-white/40">{b}</span>)}
              </div>
            </div>
            {[
              { title:'Product', links:['Features','Security','Orivo AI','Pricing','Changelog'] },
              { title:'Use Cases', links:['Law Firms','CA Firms','Healthcare','Consulting','Startups'] },
              { title:'Company', links:['About','Contact','Privacy Policy','Terms of Service','Security'] },
            ].map(col => (
              <div key={col.title}>
                <div className="font-mono text-[9px] tracking-[2px] uppercase text-white/28 mb-4">{col.title}</div>
                <ul className="space-y-2.5">{col.links.map(l => <li key={l}><a href="#" className="text-[13px] font-light text-white/50 hover:text-white/85 transition-colors">{l}</a></li>)}</ul>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <span className="text-[12px] font-light text-white/25">© 2026 SecureVault AI. All rights reserved.</span>
            <span className="font-mono text-[11px] text-white/25 flex items-center gap-2"><span className="w-1.5 h-1.5 bg-[#7B9FE8] rounded-full" />Powered by Orivo — On-premise AI intelligence</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
