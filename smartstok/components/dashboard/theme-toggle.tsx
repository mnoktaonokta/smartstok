"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/providers/theme-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={toggleTheme}
      className={cn("w-full sm:w-auto", className)}
      aria-label={isDark ? "Aydınlık temaya geç" : "Koyu temaya geç"}
      title={isDark ? "Aydınlık tema" : "Koyu tema"}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      {isDark ? "Aydınlık Tema" : "Koyu Tema"}
    </Button>
  );
}
