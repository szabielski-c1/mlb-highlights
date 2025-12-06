import './globals.css'

export const metadata = {
  title: 'MLB Highlight Script Generator',
  description: 'Generate professional announcer scripts for MLB game highlights',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen bg-mlb-navy">
        <header className="sticky top-0 z-50 bg-mlb-charcoal/95 backdrop-blur-sm border-b border-white/10">
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
            <a href="/" className="flex items-center gap-3">
              <img
                src="https://www.mlbstatic.com/team-logos/league-on-dark/1.svg"
                alt="MLB"
                className="h-10 w-auto"
              />
              <h1 className="text-xl font-bold text-white">MLB Highlights</h1>
            </a>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 py-6">
          {children}
        </main>
      </body>
    </html>
  )
}
