import { getDepartmentDisplayParts } from "@/lib/department-decodings";

type DepartmentLabelProps = {
  department: {
    name: string;
    shortName?: string | null;
  };
  className?: string;
  mutedClassName?: string;
};

export default function DepartmentLabel({
  department,
  className = "font-medium text-ink",
  mutedClassName = "mt-1 text-xs leading-5 text-muted"
}: DepartmentLabelProps) {
  const { name, fullName } = getDepartmentDisplayParts(department);

  return (
    <div>
      <div className={className}>{name}</div>
      {fullName ? <div className={mutedClassName}>{fullName}</div> : null}
    </div>
  );
}
