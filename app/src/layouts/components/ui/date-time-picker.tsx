import { cn } from "@/lib/utils/cn";
import { Clock, X } from "lucide-react";
import * as React from "react";
import { Button } from "./button";
import { Calendar } from "./calendar";
import { Input } from "./input";
import { Label } from "./label";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { ToggleGroup, ToggleGroupItem } from "./toggle-group";

interface DateTimePickerProps {
  date?: Date | null;
  setDate: (date: Date | undefined) => void;
  className?: string;
  placeholder?: string;
  showClear?: boolean;
}

export function DateTimePicker({
  date,
  setDate,
  className,
  placeholder = "dd mm yyyy at hh:mm",
  showClear = true,
}: DateTimePickerProps) {
  const minuteRef = React.useRef<HTMLInputElement>(null);
  const hourRef = React.useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = React.useState(false);

  const activeDate = date || new Date();
  const hours24 = activeDate.getHours();
  const hours = hours24 % 12 || 12;
  const minutes = activeDate.getMinutes();
  const isAM = hours24 < 12;

  const formattedHours = hours.toString().padStart(2, "0");
  const formattedMinutes = minutes.toString().padStart(2, "0");

  const formattedDate = date
    ? date.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "";

  const formattedTime = date
    ? date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    : "";

  const updateTime = (newHours: number, newMinutes: number, isPM: boolean) => {
    const updatedDate = new Date(activeDate);
    // Convert to 24-hour format if PM
    const hours24 = isPM
      ? newHours === 12
        ? 12
        : newHours + 12
      : newHours === 12
        ? 0
        : newHours;
    updatedDate.setHours(hours24);
    updatedDate.setMinutes(newMinutes);

    setDate(updatedDate);
  };

  const handleHourChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (isNaN(value)) return;

    const newHours = Math.max(1, Math.min(12, value));
    updateTime(newHours, minutes, !isAM);

    if (value > 1) {
      minuteRef.current?.focus();
    }
  };

  const handleMinuteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (isNaN(value)) return;

    const newMinutes = Math.max(0, Math.min(59, value));
    updateTime(hours, newMinutes, !isAM);
  };

  const handleAMPMToggle = (value: string) => {
    if (value === "am" || value === "pm") {
      updateTime(hours, minutes, value === "pm");
    }
  };

  const handleCalendarSelect = (selectedDate: Date | undefined) => {
    if (selectedDate) {
      const newDate = new Date(selectedDate);
      newDate.setHours(hours24);
      newDate.setMinutes(minutes);
      setDate(newDate);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDate(undefined);
  };

  return (
    <div className="relative w-full">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal",
              !date && "text-muted-foreground",
              date && showClear && "pr-10",
              className,
            )}
          >
            <Clock className="mr-2 size-4 shrink-0" />
            <span className="truncate">
              {date ? `${formattedDate} at ${formattedTime}` : placeholder}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date || undefined}
            defaultMonth={date || undefined}
            onSelect={handleCalendarSelect}
            className="mx-auto"
            autoFocus
          />
          <div className="border-t-border border-t p-4">
            <div className="flex items-end justify-center gap-2">
              <div className="grid gap-1 text-center">
                <Label htmlFor="hours" className="text-xs">
                  Hours
                </Label>
                <Input
                  id="hours"
                  ref={hourRef}
                  className="w-14 text-center"
                  value={formattedHours}
                  onChange={handleHourChange}
                  type="number"
                  min={1}
                  max={12}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <div className="mb-1 text-2xl">:</div>
              <div className="grid gap-1 text-center">
                <Label htmlFor="minutes" className="text-xs">
                  Minutes
                </Label>
                <Input
                  id="minutes"
                  ref={minuteRef}
                  className="w-14 text-center"
                  value={formattedMinutes}
                  onChange={handleMinuteChange}
                  type="number"
                  min={0}
                  max={59}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <div className="ml-2 grid gap-1">
                <Label className="text-xs">AM/PM</Label>
                <ToggleGroup
                  type="single"
                  value={isAM ? "am" : "pm"}
                  onValueChange={handleAMPMToggle}
                  className="flex"
                >
                  <ToggleGroupItem
                    value="am"
                    className="data-[state=on]:bg-primary data-[state=off]:bg-muted data-[state=on]:text-primary-foreground size-9 rounded-lg! rounded-r-none! px-2 text-xs"
                  >
                    AM
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="pm"
                    className="data-[state=on]:bg-primary data-[state=off]:bg-muted data-[state=on]:text-primary-foreground size-9 rounded-lg! rounded-l-none! px-2 text-xs"
                  >
                    PM
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {date && showClear && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 z-10 h-7 w-7 -translate-y-1/2 hover:bg-transparent"
          onClick={handleClear}
        >
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}
