'use client'
import React, { useEffect } from 'react';
import { ModeToggle } from 'src/components/ModeToggle';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem, DropdownMenuSeparator } from '../src/components/ui/dropdown-menu';
import { Button } from '../src/components/ui/button';
import { Separator } from '../src/components/ui/separator';
import { LayoutGrid, Github, User, LogIn, LogOut, Check } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { Apps, Links, canAccessApp } from './RouterConfig';
import Link from 'next/link';
import { usePermission } from '../src/hooks/usePermission';
import useConfigStore from '../store/config';
import { cn } from "@/lib/utils"
import { ScrollToTop } from '../src/components/ScrollToTop';
import { ArrowUpToLine } from 'lucide-react';
export default function Header() {
  usePermission();
  const pathname = usePathname();
  const router = useRouter();
  const currentApp = Apps.find((app) => app.url === pathname);
  const { role, logout, checkAuth } = useConfigStore();
  const visibleApps = Apps.filter((app) => canAccessApp(app, role));

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  const handleLogin = () => {
    router.push('/login');
  };

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (currentApp) {
      document.title = currentApp.name;
    }
  }, [pathname, currentApp]);
  return (
    <header className="sticky left-0 right-0 top-0  z-50 bg-background border-b-0.5 border-border">
      <link rel="icon" href="/favicon.ico" sizes="any" />
      <div
        className={
          'px-4 py-2 bg-background border-b border-border flex items-center'
        }
      >
        <div className="mr-4 flex items-center space-x-2">

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <LayoutGrid />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[300px] p-4">
              <div className="grid grid-cols-3 gap-4">
                {visibleApps.map((app) => {
                  const Icon = app.icon;
                  return (
                    <Link
                      href={app.url}
                      key={app.name}
                      className={cn(
                        "flex flex-col items-center justify-center rounded-md border p-2 hover:bg-accent",
                        currentApp?.url === app.url && "bg-accent"
                      )}
                    >
                      {Icon && <Icon className="mb-2 h-6 w-6" />}
                      <span className="text-xs">{app.name}</span>
                    </Link>
                  );
                })}
              </div>
              <Separator className="my-4" />
              <div className="grid grid-cols-3 gap-4">
                {Links.map((app) => {
                  const Icon = app.icon;
                  return (
                    <a
                      href={app.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      key={app.name}
                      className="flex flex-col items-center justify-center rounded-md border p-2 hover:bg-accent"
                    >
                      {Icon && <Icon className="mb-2 h-6 w-6" />}
                      <span className="text-xs">{app.name}</span>
                    </a>
                  );
                })}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="font-bold ">{currentApp?.name}</span>
        </div>
        <div className="flex-1 " />
        <div className='space-x-2'>
          <ScrollToTop scrollTo={10} variant="outline"
            size="icon"
          >
            <ArrowUpToLine />
          </ScrollToTop>
          <ModeToggle />
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              window.open('https://github.com/lxw15337674/todo-web', '_blank')
            }}
          >
            <Github />
          </Button>
          {role !== 'none' ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <User className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem disabled>
                  <Check className="mr-2 h-4 w-4" />
                  {role === 'admin' ? '已登录（管理员）' : '已登录（图床）'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button variant="outline" size="icon" onClick={handleLogin}>
              <LogIn className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
