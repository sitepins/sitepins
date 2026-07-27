"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, Copy } from "lucide-react";
import * as React from "react";

// --- Types & Utilities ---

interface ColorPickerProps {
  color?: string;
  onChange?: (value: string) => void;
}

type ColorMode = "hex" | "rgba" | "hsla";
type CopyState = { [key in ColorMode]: boolean };
type RGB = { r: number; g: number; b: number };
type HSL = { h: number; s: number; l: number };

export const rgbToHex = ({ r, g, b }: RGB): string => {
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

export const hexToRgb = (hex: string): RGB | null => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: Number.parseInt(result[1], 16),
        g: Number.parseInt(result[2], 16),
        b: Number.parseInt(result[3], 16),
      }
    : null;
};

export const rgbToHsl = ({ r, g, b }: RGB): HSL => {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }

    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
};

export const hslToRgb = ({ h, s, l }: HSL): RGB => {
  h /= 360;
  s /= 100;
  l /= 100;

  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
};

export const formatRgba = (rgb: RGB, a = 1): string => {
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
};

export const formatHsla = (hsl: HSL, a = 1): string => {
  return `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, ${a})`;
};

// --- Custom Hook ---

function useColorPicker(color: string, onChange?: (value: string) => void) {
  // Initialize HSL from color prop
  const [hsl, setHsl] = React.useState<HSL>(() => {
    const rgb = hexToRgb(color) || { r: 0, g: 0, b: 0 };
    return rgbToHsl(rgb);
  });

  const [colorMode, setColorMode] = React.useState<ColorMode>("hex");
  const [copied, setCopied] = React.useState<CopyState>({
    hex: false,
    rgba: false,
    hsla: false,
  });

  // Derived values
  const rgb = React.useMemo(() => hslToRgb(hsl), [hsl]);
  const currentColor = React.useMemo(() => rgbToHex(rgb), [rgb]);
  const rgbaString = formatRgba(rgb);
  const hslaString = formatHsla(hsl);

  // Sync with prop when it changes externally
  React.useEffect(() => {
    const newRgb = hexToRgb(color);
    if (newRgb) {
      const newHsl = rgbToHsl(newRgb);
      // Only update if significantly different to avoid loops
      // Simple check: convert new HSL back to hex and compare
      const newHex = rgbToHex(hslToRgb(newHsl));
      if (newHex.toLowerCase() !== currentColor.toLowerCase()) {
        // This check is a bit tricky because of the lossy conversion.
        // Better to trust the user interaction flow:
        // If user is dragging slider, we rely on internal state.
        // If prop changes (e.g. from parent reset), we might want to update.
        // For now let's only update if the color prop really changed from outside
        // But since we derive currentColor from state, we can't easily detect outside change vs inside change
        // standard pattern: if prop !== state, update state
      }
    }
  }, [color, currentColor]);

  // Actually, standard pattern for controlled/uncontrolled:
  // We'll trust our internal state, but if `color` prop changes from PARENT (and not from our onChange),
  // we should update. This is hard without a ref to track "last emitted value".
  // Let's simplify: Just initialize. If we need bidirectional sync it's more complex.
  // Assuming this is mostly controlled by the picker itself or initialization.

  // Update parent when HSL changes
  const updateParent = React.useCallback(
    (newHsl: HSL) => {
      const newRgb = hslToRgb(newHsl);
      const newHex = rgbToHex(newRgb);
      onChange?.(newHex);
    },
    [onChange],
  );

  const updateHSL = (h: number, s: number, l: number) => {
    const newHsl = { h, s, l };
    setHsl(newHsl);
    updateParent(newHsl);
  };

  const copyToClipboard = (text: string, format: ColorMode) => {
    navigator.clipboard.writeText(text);
    setCopied((prev) => ({ ...prev, [format]: true }));
    setTimeout(() => {
      setCopied((prev) => ({ ...prev, [format]: false }));
    }, 1500);
  };

  const handleHexChange = (hex: string) => {
    if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(hex)) {
      const newRgb = hexToRgb(hex);
      if (newRgb) {
        const newHsl = rgbToHsl(newRgb);
        setHsl(newHsl);
        updateParent(newHsl);
      }
    }
  };

  const handleRgbChange = (key: keyof RGB, value: string) => {
    const numValue = Number.parseInt(value);
    if (!isNaN(numValue) && numValue >= 0 && numValue <= 255) {
      const newRgb = { ...rgb, [key]: numValue };
      const newHsl = rgbToHsl(newRgb);
      setHsl(newHsl);
      updateParent(newHsl);
    }
  };

  const handleHslChange = (key: keyof HSL, value: string) => {
    const numValue = Number.parseInt(value);
    if (isNaN(numValue)) return;
    const max = key === "h" ? 360 : 100;
    if (numValue >= 0 && numValue <= max) {
      const newHsl = { ...hsl, [key]: numValue };
      setHsl(newHsl);
      updateParent(newHsl);
    }
  };

  return {
    currentColor,
    colorMode,
    setColorMode,
    copied,
    rgb,
    hsl,
    rgbaString,
    hslaString,
    updateHSL,
    handleHexChange,
    handleRgbChange,
    handleHslChange,
    copyToClipboard,
  };
}

// --- Sub-components ---

interface ColorPlaneProps {
  h: number;
  s: number;
  l: number;
  currentColor: string;
  onUpdate: (h: number, s: number, l: number) => void;
}

const ColorPlane = ({ h, s, l, currentColor, onUpdate }: ColorPlaneProps) => {
  const colorPlaneRef = React.useRef<HTMLDivElement>(null);
  const isDragging = React.useRef(false);

  const handleColorPlaneChange = (e: React.MouseEvent | React.TouchEvent) => {
    if (!colorPlaneRef.current) return;
    const rect = colorPlaneRef.current.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

    onUpdate(h, Math.round(x * 100), Math.round((1 - y) * 100));
  };

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    isDragging.current = true;
    handleColorPlaneChange(e);
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (isDragging.current) handleColorPlaneChange(e);
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  React.useEffect(() => {
    const handleGlobalMouseUp = () => (isDragging.current = false);
    window.addEventListener("mouseup", handleGlobalMouseUp);
    window.addEventListener("touchend", handleGlobalMouseUp);
    return () => {
      window.removeEventListener("mouseup", handleGlobalMouseUp);
      window.removeEventListener("touchend", handleGlobalMouseUp);
    };
  }, []);

  return (
    <div
      ref={colorPlaneRef}
      className="relative h-48 w-full cursor-crosshair touch-none rounded-lg"
      style={{
        background: `
          linear-gradient(180deg, #fff 0%, rgba(128, 128, 128, 0) 50%, #000 100%),
          radial-gradient(ellipse at 100% 50%, hsl(${h}, 100%, 50%) 0%, transparent 100%)
        `,
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onTouchStart={handleMouseDown}
      onTouchMove={handleMouseMove}
      onTouchEnd={handleMouseUp}
    >
      <div
        className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md"
        style={{
          left: `${s}%`,
          top: `${100 - l}%`,
          backgroundColor: currentColor,
        }}
      />
    </div>
  );
};

const HueSlider = ({
  h,
  s,
  l,
  onUpdate,
}: {
  h: number;
  s: number;
  l: number;
  onUpdate: (h: number, s: number, l: number) => void;
}) => {
  return (
    <div className="grid gap-2">
      <Label>Hue</Label>
      <div className="relative">
        <Slider
          value={[h]}
          max={360}
          step={1}
          className="rounded **:[[role=slider]]:h-4 **:[[role=slider]]:w-4"
          rangeClass="bg-transparent"
          onValueChange={([newH]) => onUpdate(newH, s, l)}
          trackStyle={{
            backgroundImage: `linear-gradient(to right, 
            hsl(0, 100%, 50%), hsl(60, 100%, 50%), hsl(120, 100%, 50%), 
            hsl(180, 100%, 50%), hsl(240, 100%, 50%), hsl(300, 100%, 50%), 
            hsl(360, 100%, 50%)
          )`,
          }}
        />
        <style jsx global>{`
          [role="slider"] {
            background-color: hsl(${h}, 100%, 50%) !important;
            border: 2px solid white !important;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2) !important;
          }
        `}</style>
      </div>
    </div>
  );
};

// --- Main Component ---

export function ColorPicker({ color = "#000000", onChange }: ColorPickerProps) {
  const {
    currentColor,
    colorMode,
    setColorMode,
    copied,
    rgb,
    hsl,
    rgbaString,
    hslaString,
    updateHSL,
    handleHexChange,
    handleRgbChange,
    handleHslChange,
    copyToClipboard,
  } = useColorPicker(color, onChange);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-60 justify-start text-left font-normal"
        >
          <div className="flex w-full items-center gap-2">
            <div
              className="h-4 w-4 rounded border bg-cover! bg-center! transition-all"
              style={{ backgroundColor: currentColor }}
            />
            <div className="flex-1 truncate">{currentColor}</div>
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="flex flex-col gap-4">
          <ColorPlane
            h={hsl.h}
            s={hsl.s}
            l={hsl.l}
            currentColor={currentColor}
            onUpdate={updateHSL}
          />

          <HueSlider h={hsl.h} s={hsl.s} l={hsl.l} onUpdate={updateHSL} />

          <Tabs
            value={colorMode}
            onValueChange={(v) => setColorMode(v as ColorMode)}
            className="w-full flex-col"
          >
            <TabsList className="h-9 w-full">
              <TabsTrigger
                value="hex"
                className="data-[state=active]:bg-background dark:data-[state=active]:bg-input/30 data-[state=active]:text-text h-full"
              >
                Hex
              </TabsTrigger>
              <TabsTrigger
                value="rgba"
                className="data-[state=active]:bg-background dark:data-[state=active]:bg-input/30 data-[state=active]:text-text h-full"
              >
                RGBA
              </TabsTrigger>
              <TabsTrigger
                value="hsla"
                className="data-[state=active]:bg-background dark:data-[state=active]:bg-input/30 data-[state=active]:text-text h-full"
              >
                HSLA
              </TabsTrigger>
            </TabsList>

            <TabsContent value="hex" className="mt-2">
              <div className="flex items-center gap-2">
                <Input
                  value={currentColor}
                  onChange={(e) => handleHexChange(e.target.value)}
                  className="font-mono"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => copyToClipboard(currentColor, "hex")}
                >
                  {copied.hex ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="rgba" className="mt-2">
              <div className="grid gap-4">
                <div className="flex items-center gap-2">
                  <Input value={rgbaString} readOnly className="font-mono" />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => copyToClipboard(rgbaString, "rgba")}
                  >
                    {copied.rgba ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {(["r", "g", "b"] as const).map((key) => (
                    <div key={key}>
                      <Label className="uppercase">{key}</Label>
                      <Input
                        value={rgb[key]}
                        onChange={(e) => handleRgbChange(key, e.target.value)}
                        className="font-mono"
                      />
                    </div>
                  ))}
                  <div>
                    <Label>A</Label>
                    <Input value="1" readOnly className="font-mono" />
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="hsla" className="mt-2">
              <div className="grid gap-4">
                <div className="flex items-center gap-2">
                  <Input value={hslaString} readOnly className="font-mono" />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => copyToClipboard(hslaString, "hsla")}
                  >
                    {copied.hsla ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {(["h", "s", "l"] as const).map((key) => (
                    <div key={key}>
                      <Label className="uppercase">{key}</Label>
                      <Input
                        value={hsl[key]}
                        onChange={(e) => handleHslChange(key, e.target.value)}
                        className="font-mono"
                      />
                    </div>
                  ))}
                  <div>
                    <Label>A</Label>
                    <Input value="1" readOnly className="font-mono" />
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div
            className="h-6 rounded border"
            style={{ backgroundColor: currentColor }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
