import * as React from "react";
import { cn } from "@/lib/utils";

interface RadioGroupContextValue {
  value?: string;
  onValueChange?: (value: string) => void;
}

const RadioGroupContext = React.createContext<RadioGroupContextValue>({});

type RadioGroupProps<T extends string = string> = {
  className?: string;
  value?: T;
  defaultValue?: T;
  onValueChange?: (value: T) => void; // ✅ now supports unions like EventColor
  children: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "defaultValue">;

export function RadioGroup<T extends string = string>({
  className,
  value,
  defaultValue,
  onValueChange,
  children,
  ...props
}: RadioGroupProps<T>) {
  const [internalValue, setInternalValue] = React.useState<string>(defaultValue ?? "");
  const isControlled = value !== undefined;

  const currentValue = (isControlled ? value : internalValue) ?? "";

  const handleChange = (v: string) => {
    if (!isControlled) setInternalValue(v);
    onValueChange?.(v as T); // ✅ cast safely to inferred union type
  };

  return (
    <RadioGroupContext.Provider value={{ value: currentValue, onValueChange: handleChange }}>
      <div role="radiogroup" className={cn("grid gap-2", className)} {...props}>
        {children}
      </div>
    </RadioGroupContext.Provider>
  );
}

export function RadioGroupItem({
  className,
  value,
  id,
  "aria-label": ariaLabel,
  ...props
}: {
  className?: string;
  value: string;
  id?: string;
  "aria-label"?: string;
} & React.HTMLAttributes<HTMLButtonElement>) {
  const { value: groupValue, onValueChange } = React.useContext(RadioGroupContext);
  const checked = groupValue === value;

  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={ariaLabel}
      data-state={checked ? "checked" : "unchecked"}
      id={id}
      className={cn(
        "aspect-square rounded-full border-2 ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer",
        checked ? "border-primary" : "border-muted-foreground/30",
        className
      )}
      onClick={() => onValueChange?.(value)}
      {...props}
    >
      {checked && (
        <span className="flex items-center justify-center">
          <span className="h-2.5 w-2.5 rounded-full bg-current" />
        </span>
      )}
    </button>
  );
}
