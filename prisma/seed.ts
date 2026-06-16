import { PrismaClient, Role, PeriodStatus } from "@prisma/client";
import { hashPassword } from "../lib/password";

const prisma = new PrismaClient();

const departments = [
  ["Продажи", "Sales"],
  ["Маркетинг", "Mkt"],
  ["Финансы", "Fin"],
  ["HR", "HR"],
  ["IT", "IT"],
  ["Операции", "Ops"]
] as const;

const leaders = [
  ["Анна Смирнова", "anna@company.test", "Продажи"],
  ["Илья Орлов", "ilya@company.test", "Маркетинг"],
  ["Ольга Захарова", "olga@company.test", "Финансы"],
  ["Дина Ахметова", "dina@company.test", "HR"],
  ["Роман Ким", "roman@company.test", "IT"],
  ["Максим Волков", "maxim@company.test", "Операции"]
] as const;

async function main() {
  const passwordHash = hashPassword("demo123");

  const departmentByName = new Map<string, { id: string; name: string }>();
  for (const [name, shortName] of departments) {
    const department = await prisma.department.upsert({
      where: { name },
      update: { shortName, isActive: true },
      create: { name, shortName }
    });
    departmentByName.set(name, department);
  }

  await prisma.user.upsert({
    where: { email: "admin@company.test" },
    update: { name: "Администратор", role: Role.ADMIN, passwordHash, mustChangePassword: false, isActive: true },
    create: {
      name: "Администратор",
      email: "admin@company.test",
      passwordHash,
      role: Role.ADMIN,
      mustChangePassword: false
    }
  });

  await prisma.user.upsert({
    where: { email: "viewer@company.test" },
    update: { name: "Аналитик", role: Role.ANALYST, passwordHash, mustChangePassword: false, isActive: true },
    create: {
      name: "Аналитик",
      email: "viewer@company.test",
      passwordHash,
      role: Role.ANALYST,
      mustChangePassword: false
    }
  });

  await prisma.user.upsert({
    where: { email: "director@company.test" },
    update: { name: "Директор", role: Role.DIRECTOR, passwordHash, departmentId: null, mustChangePassword: false, isActive: true },
    create: {
      name: "Директор",
      email: "director@company.test",
      passwordHash,
      role: Role.DIRECTOR,
      mustChangePassword: false
    }
  });

  const userByDepartment = new Map<string, { id: string }>();
  for (const [name, email, departmentName] of leaders) {
    const department = departmentByName.get(departmentName);
    if (!department) continue;

    const user = await prisma.user.upsert({
      where: { email },
      update: { name, role: Role.LEADER, passwordHash, departmentId: department.id, position: "Руководитель", mustChangePassword: false, isActive: true },
      create: {
        name,
        email,
        passwordHash,
        role: Role.LEADER,
        departmentId: department.id,
        position: "Руководитель",
        mustChangePassword: false
      }
    });
    userByDepartment.set(departmentName, user);
  }

  const overallCriterion = await prisma.criterion.upsert({
    where: { name: "Общая оценка взаимодействия" },
    update: {
      description: "Сводная оценка качества коммуникации, сроков и результата совместной работы",
      isActive: true
    },
    create: {
      name: "Общая оценка взаимодействия",
      description: "Сводная оценка качества коммуникации, сроков и результата совместной работы",
      weight: 1
    }
  });

  await prisma.criterion.upsert({
    where: { name: "Скорость реакции" },
    update: { isActive: true },
    create: {
      name: "Скорость реакции",
      description: "Насколько быстро подразделение отвечает на запросы",
      weight: 1
    }
  });

  await prisma.criterion.upsert({
    where: { name: "Качество результата" },
    update: { isActive: true },
    create: {
      name: "Качество результата",
      description: "Насколько результат соответствует ожиданиям",
      weight: 1
    }
  });

  const periods = [
    { month: 3, year: 2026, status: PeriodStatus.CLOSED },
    { month: 4, year: 2026, status: PeriodStatus.CLOSED },
    { month: 5, year: 2026, status: PeriodStatus.OPEN }
  ];

  const periodRecords = [];
  for (const period of periods) {
    periodRecords.push(
      await prisma.period.upsert({
        where: { month_year: { month: period.month, year: period.year } },
        update: { status: period.status },
        create: period
      })
    );
  }

  const comments = [
    "Задержки в согласовании документов, нужен единый SLA по ответам.",
    "Запросы часто возвращаются без владельца задачи.",
    "Не хватило прозрачности по срокам выполнения.",
    "Коммуникация стала лучше, но по срочным вопросам пока есть разрывы."
  ];

  for (const period of periodRecords) {
    let commentIndex = 0;
    for (const evaluator of departmentByName.values()) {
      for (const evaluatee of departmentByName.values()) {
        if (evaluator.id === evaluatee.id) continue;
        if (period.status === PeriodStatus.OPEN && evaluator.name === "HR" && ["IT", "Операции"].includes(evaluatee.name)) {
          continue;
        }

        const rawScore =
          7 +
          ((evaluator.name.length + evaluatee.name.length + period.month + commentIndex) % 4);
        const score = Math.min(10, rawScore);
        const author = userByDepartment.get(evaluator.name);
        if (!author) continue;

        await prisma.evaluation.upsert({
          where: {
            periodId_evaluatorDepartmentId_evaluateeDepartmentId_criterionId: {
              periodId: period.id,
              evaluatorDepartmentId: evaluator.id,
              evaluateeDepartmentId: evaluatee.id,
              criterionId: overallCriterion.id
            }
          },
          update: {
            score,
            noInteraction: false,
            comment: score < 9 ? comments[commentIndex % comments.length] : null,
            authorId: author.id
          },
          create: {
            periodId: period.id,
            evaluatorDepartmentId: evaluator.id,
            evaluateeDepartmentId: evaluatee.id,
            criterionId: overallCriterion.id,
            score,
            noInteraction: false,
            comment: score < 9 ? comments[commentIndex % comments.length] : null,
            authorId: author.id
          }
        });
        commentIndex += 1;
      }
    }
  }

  for (const evaluator of departmentByName.values()) {
    for (const evaluatee of departmentByName.values()) {
      if (evaluator.id === evaluatee.id) continue;
      await prisma.evaluationRequirement.upsert({
        where: {
          evaluatorDepartmentId_evaluateeDepartmentId: {
            evaluatorDepartmentId: evaluator.id,
            evaluateeDepartmentId: evaluatee.id
          }
        },
        update: { isActive: true },
        create: {
          evaluatorDepartmentId: evaluator.id,
          evaluateeDepartmentId: evaluatee.id,
          isActive: true
        }
      });
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
