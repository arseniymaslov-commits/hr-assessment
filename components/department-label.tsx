import { getDepartmentFullName } from "@/lib/department-decodings";

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
  const fullName = getDepartmentFullName(department.name, department.shortName);

  return (
    <div>
      <div className={className}>{department.name}</div>
      {fullName ? <div className={mutedClassName}>{fullName}</div> : null}
    </div>
  );
}
