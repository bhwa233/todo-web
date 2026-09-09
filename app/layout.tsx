'use client';
import './global.css';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import theme from '../src/theme';
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import { ThemeProvider as NextThemeProvider } from "@/components/theme-provider"
import Header from './Header';
import { SidebarProvider } from '../src/components/ui/sidebar';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Toaster } from '../src/components/ui/toaster';



export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html suppressHydrationWarning>
      <body>
        <SidebarProvider>
          <AppRouterCacheProvider options={{ enableCssLayer: true }}>
            <ThemeProvider theme={theme} defaultMode="dark" >
              <NextThemeProvider
                attribute="class"
                defaultTheme="dark"
              >
                <CssBaseline enableColorScheme />
                <main className='min-h-screen h-full w-full min-w-0'>
                  <Header />
                  {children}
                  <Toaster />
                  <SpeedInsights />
                </main>
              </NextThemeProvider>
            </ThemeProvider>
          </AppRouterCacheProvider>
        </SidebarProvider>
      </body>
    </html>
  );
}
