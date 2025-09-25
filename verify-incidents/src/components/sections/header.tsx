"use client";

import Image from "next/image";
import Link from "next/link";
import React from "react";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { LogOut, User } from "lucide-react";

const Header = () => {
  const { user, isAuthenticated } = useAuth();
  const pathname = usePathname();

  // Only show "Failure Event" link on /incidents/create page
  const showFailureEventLink = pathname === '/incidents/create';

  const handleLogout = async () => {
    await signOut({ callbackUrl: '/' });
  };

  return (
    <header className="bg-background">
      <div className="mx-auto max-w-[850px] px-5 pt-[70px] pb-[70px] md:px-0">
        <div className="flex items-center justify-between">
          <a href="https://argosidentity.com/">
            <Image
              src="/logo.jpg"
              alt="Argosidentity logo"
              width={180}
              height={26}
            />
          </a>
          <div className="flex items-center gap-6">
            <a
              href="http://localhost:3000"
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              시스템 상태
            </a>
            {showFailureEventLink && (
              <Link
                href="/incidents"
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                Failure Event
              </Link>
            )}
            {isAuthenticated && user ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <User className="w-4 h-4" />
                  <span>{user.name || user.email}</span>
                </div>
                <Button
                  onClick={handleLogout}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  로그아웃
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;