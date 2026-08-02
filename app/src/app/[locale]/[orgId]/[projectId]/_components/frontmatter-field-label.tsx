import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils/cn";
import { TField } from "@/types";

/** Label and description chrome shared by every rendered frontmatter field. */

export function Description({ description }: { description?: string }) {
  if (!description) {
    return null;
  }

  return <p className={cn("text-muted-foreground text-sm")}>{description}</p>;
}

interface PreviewLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  isRequired?: boolean;
  className?: string;
  children?: React.ReactNode;
  length?: number;
  maxLength?: number;
  isIgnored?: boolean;
  type?: string;
  name?: string;
  value?: unknown;
  fields?: TField[];
  description?: string;
  defaultValue?: string;
  alwaysUseCurrentDate?: boolean;
  isDropdown?: boolean;
  options?: string[];
  referenceType?: string;
  referencePath?: string;
  referenceInclude?: string;
  referenceExclude?: string;
  referenceField?: string;
  subType?: string;
  label?: string;
}

export function PreviewLabel({
  isRequired,
  children,
  className,
  length,
  maxLength,
  // Field specific props to avoid spreading to DOM
  isIgnored: _isIgnored,
  type: _type,
  name: _name,
  value,
  fields: _fields,
  description: _description,
  defaultValue: _defaultValue,
  alwaysUseCurrentDate: _alwaysUseCurrentDate,
  isDropdown: _isDropdown,
  options: _options,
  referenceType: _referenceType,
  referencePath: _referencePath,
  referenceInclude: _referenceInclude,
  referenceExclude: _referenceExclude,
  referenceField: _referenceField,
  subType: _subType,
  label: _label,
  ...props
}: PreviewLabelProps) {
  // `length` on the schema field is a snapshot, so count the live value instead.
  const currentLength = typeof value === "string" ? value.length : length;

  const getBadgeVariant = () => {
    if (currentLength === undefined || maxLength === undefined)
      return "default";

    const percentage = (currentLength / maxLength) * 100;

    if (currentLength > maxLength) return "destructive"; // Over limit
    if (percentage >= 80) return "warning"; // Warning - close to limit
    if (percentage >= 50) return "success"; // Good range
    return "outline"; // Too short
  };

  return (
    <Label className={cn("mb-2 flex capitalize", className)} {...props}>
      {children}
      {isRequired && <span className="text-destructive">*</span>}
      {currentLength !== undefined && maxLength !== undefined && (
        <Badge variant={getBadgeVariant()} className="ml-auto">
          {currentLength}/{maxLength}
        </Badge>
      )}
    </Label>
  );
}
