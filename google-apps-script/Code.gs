const SHEETS = {
  departments: "Подразделения",
  users: "Пользователи",
  periods: "Периоды",
  criteria: "Критерии",
  evaluations: "Оценки",
  export: "Экспорт"
};

const HEADERS = {
  departments: ["id", "name", "shortName", "isActive"],
  users: ["id", "name", "email", "role", "departmentId", "isActive"],
  periods: ["id", "month", "year", "status", "createdAt"],
  criteria: ["id", "name", "description", "isActive"],
  evaluations: [
    "id",
    "periodId",
    "evaluatorDepartmentId",
    "evaluateeDepartmentId",
    "criterionId",
    "score",
    "comment",
    "createdAt",
    "authorEmail"
  ]
};

const ROLE = {
  ADMIN: "ADMIN",
  LEADER: "LEADER",
  VIEWER: "VIEWER"
};

const PERIOD_STATUS = {
  OPEN: "OPEN",
  CLOSED: "CLOSED"
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Оценка взаимодействия")
    .addItem("Создать / обновить MVP", "setupMvp")
    .addItem("Собрать лист Экспорт", "buildExportSheet")
    .addToUi();
}

function doGet() {
  setupMvp();
  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle("Оценка взаимодействия")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function setupMvp() {
  const ss = SpreadsheetApp.getActive();
  Object.keys(HEADERS).forEach(function (key) {
    ensureSheet_(ss, SHEETS[key], HEADERS[key]);
  });

  seedMvp_();
  return { ok: true };
}

function getInitialData(emailOverride) {
  setupMvp();
  const user = getCurrentUser_(emailOverride);
  const data = getReferenceData_();

  return {
    user: user,
    departments: data.departments,
    users: user && user.role === ROLE.ADMIN ? data.users : [],
    periods: data.periods,
    criteria: data.criteria,
    dashboard: getDashboardData({ emailOverride: emailOverride }),
    canReadEmailAutomatically: Boolean(getSessionEmail_())
  };
}

function getDashboardData(filters) {
  setupMvp();
  filters = filters || {};
  const user = getCurrentUser_(filters.emailOverride);
  if (!user) return { error: "Пользователь не найден. Обратитесь к администратору." };

  const data = getReferenceData_();
  const selectedPeriod =
    data.periods.find(function (period) {
      return period.id === filters.periodId;
    }) || data.periods[0];

  const generalCriterion =
    data.criteria.find(function (criterion) {
      return criterion.name === "Общая оценка взаимодействия";
    }) || data.criteria[0];

  if (!selectedPeriod || !generalCriterion) {
    return emptyDashboard_(data, selectedPeriod);
  }

  const departmentFilter = filters.departmentId || "";
  const activeDepartmentIds = data.departments.map(function (department) {
    return department.id;
  });

  const evaluations = getRows_("evaluations")
    .filter(function (evaluation) {
      return (
        evaluation.periodId === selectedPeriod.id &&
        evaluation.criterionId === generalCriterion.id &&
        activeDepartmentIds.indexOf(evaluation.evaluatorDepartmentId) >= 0 &&
        activeDepartmentIds.indexOf(evaluation.evaluateeDepartmentId) >= 0
      );
    })
    .map(function (evaluation) {
      return enrichEvaluation_(evaluation, data);
    });

  const visibleEvaluations = departmentFilter
    ? evaluations.filter(function (evaluation) {
        return (
          evaluation.evaluatorDepartmentId === departmentFilter ||
          evaluation.evaluateeDepartmentId === departmentFilter
        );
      })
    : evaluations;

  const byEvaluatee = data.departments.map(function (department) {
    const scores = evaluations
      .filter(function (evaluation) {
        return evaluation.evaluateeDepartmentId === department.id;
      })
      .map(function (evaluation) {
        return Number(evaluation.score);
      });
    return {
      department: department,
      average: average_(scores),
      count: scores.length,
      lowCount: scores.filter(function (score) {
        return score < 9;
      }).length
    };
  });

  const byEvaluator = data.departments.map(function (department) {
    const scores = evaluations
      .filter(function (evaluation) {
        return evaluation.evaluatorDepartmentId === department.id;
      })
      .map(function (evaluation) {
        return Number(evaluation.score);
      });
    return {
      department: department,
      average: average_(scores),
      count: scores.length
    };
  });

  const expectedPerDepartment = Math.max(0, data.departments.length - 1);
  const completion = data.departments.map(function (department) {
    const filled = evaluations.filter(function (evaluation) {
      return evaluation.evaluatorDepartmentId === department.id;
    }).length;
    return {
      department: department,
      filled: filled,
      missing: Math.max(0, expectedPerDepartment - filled),
      isComplete: filled >= expectedPerDepartment
    };
  });

  const dynamics = data.periods
    .slice()
    .reverse()
    .map(function (period) {
      const scores = getRows_("evaluations")
        .filter(function (evaluation) {
          return evaluation.periodId === period.id && evaluation.criterionId === generalCriterion.id;
        })
        .map(function (evaluation) {
          return Number(evaluation.score);
        });
      return {
        period: period,
        average: average_(scores)
      };
    });

  const expectedCount = data.departments.length * Math.max(0, data.departments.length - 1);

  return {
    user: user,
    selectedPeriod: selectedPeriod,
    departments: data.departments,
    periods: data.periods,
    criteria: data.criteria,
    evaluations: visibleEvaluations,
    matrixEvaluations: evaluations,
    byEvaluatee: byEvaluatee,
    byEvaluator: byEvaluator,
    companyAverage: average_(
      evaluations.map(function (evaluation) {
        return Number(evaluation.score);
      })
    ),
    lowScores: visibleEvaluations.filter(function (evaluation) {
      return Number(evaluation.score) < 9;
    }),
    expectedCount: expectedCount,
    missingCount: Math.max(0, expectedCount - evaluations.length),
    completion: completion,
    dynamics: dynamics
  };
}

function submitEvaluation(input) {
  setupMvp();
  input = input || {};
  const user = getCurrentUser_(input.emailOverride);
  if (!user || [ROLE.ADMIN, ROLE.LEADER].indexOf(user.role) < 0) {
    throw new Error("Недостаточно прав для сохранения оценки.");
  }

  const score = Number(input.score);
  const comment = String(input.comment || "").trim();
  if (!input.periodId || !input.evaluatorDepartmentId || !input.evaluateeDepartmentId || !input.criterionId) {
    throw new Error("Заполните все обязательные поля.");
  }
  if (input.evaluatorDepartmentId === input.evaluateeDepartmentId) {
    throw new Error("Подразделение не оценивает само себя.");
  }
  if (!Number.isInteger(score) || score < 1 || score > 10) {
    throw new Error("Оценка должна быть целым числом от 1 до 10.");
  }
  if (score < 9 && !comment) {
    throw new Error("Для оценки ниже 9 комментарий обязателен.");
  }
  if (user.role === ROLE.LEADER && user.departmentId !== input.evaluatorDepartmentId) {
    throw new Error("Руководитель может заполнять только свое подразделение.");
  }

  const period = getRows_("periods").find(function (item) {
    return item.id === input.periodId;
  });
  if (!period || period.status !== PERIOD_STATUS.OPEN) {
    throw new Error("Период закрыт или не найден.");
  }

  const sheet = getSheet_("evaluations");
  const rows = getRows_("evaluations");
  const existingIndex = rows.findIndex(function (evaluation) {
    return (
      evaluation.periodId === input.periodId &&
      evaluation.evaluatorDepartmentId === input.evaluatorDepartmentId &&
      evaluation.evaluateeDepartmentId === input.evaluateeDepartmentId &&
      evaluation.criterionId === input.criterionId
    );
  });

  const row = [
    existingIndex >= 0 ? rows[existingIndex].id : makeId_("eval"),
    input.periodId,
    input.evaluatorDepartmentId,
    input.evaluateeDepartmentId,
    input.criterionId,
    score,
    comment,
    new Date(),
    user.email
  ];

  if (existingIndex >= 0) {
    sheet.getRange(existingIndex + 2, 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }

  return { ok: true, message: "Оценка сохранена." };
}

function addDepartment(input) {
  requireAdmin_(input && input.emailOverride);
  const name = String(input.name || "").trim();
  const shortName = String(input.shortName || "").trim();
  if (!name || !shortName) throw new Error("Укажите название и краткое имя.");
  upsertByName_("departments", name, [makeId_("dep"), name, shortName, true]);
  return { ok: true };
}

function deleteDepartment(input) {
  requireAdmin_(input && input.emailOverride);
  softDelete_("departments", input.id);
  return { ok: true };
}

function addCriterion(input) {
  requireAdmin_(input && input.emailOverride);
  const name = String(input.name || "").trim();
  const description = String(input.description || "").trim();
  if (!name) throw new Error("Укажите название критерия.");
  upsertByName_("criteria", name, [makeId_("crit"), name, description, true]);
  return { ok: true };
}

function deleteCriterion(input) {
  requireAdmin_(input && input.emailOverride);
  const criterion = getRows_("criteria").find(function (item) {
    return item.id === input.id;
  });
  if (criterion && criterion.name === "Общая оценка взаимодействия") {
    throw new Error("Базовый критерий нужен для дашборда.");
  }
  softDelete_("criteria", input.id);
  return { ok: true };
}

function addUser(input) {
  requireAdmin_(input && input.emailOverride);
  const name = String(input.name || "").trim();
  const email = String(input.email || "").trim().toLowerCase();
  const role = String(input.role || ROLE.LEADER);
  if (!name || !email) throw new Error("Укажите имя и email.");
  if (role === ROLE.LEADER && !input.departmentId) throw new Error("Укажите подразделение руководителя.");
  upsertByEmail_("users", email, [
    makeId_("usr"),
    name,
    email,
    role,
    role === ROLE.LEADER ? input.departmentId : "",
    true
  ]);
  return { ok: true };
}

function openPeriod(input) {
  requireAdmin_(input && input.emailOverride);
  const month = Number(input.month);
  const year = Number(input.year);
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) {
    throw new Error("Укажите корректный месяц и год.");
  }

  const sheet = getSheet_("periods");
  const rows = getRows_("periods");
  rows.forEach(function (period, index) {
    if (period.status === PERIOD_STATUS.OPEN) {
      sheet.getRange(index + 2, 4).setValue(PERIOD_STATUS.CLOSED);
    }
  });

  const existingIndex = rows.findIndex(function (period) {
    return Number(period.month) === month && Number(period.year) === year;
  });
  if (existingIndex >= 0) {
    sheet.getRange(existingIndex + 2, 4).setValue(PERIOD_STATUS.OPEN);
  } else {
    sheet.appendRow([makeId_("per"), month, year, PERIOD_STATUS.OPEN, new Date()]);
  }
  return { ok: true };
}

function setPeriodStatus(input) {
  requireAdmin_(input && input.emailOverride);
  const status = input.status === PERIOD_STATUS.OPEN ? PERIOD_STATUS.OPEN : PERIOD_STATUS.CLOSED;
  const sheet = getSheet_("periods");
  const rows = getRows_("periods");
  rows.forEach(function (period, index) {
    if (status === PERIOD_STATUS.OPEN && period.id !== input.id && period.status === PERIOD_STATUS.OPEN) {
      sheet.getRange(index + 2, 4).setValue(PERIOD_STATUS.CLOSED);
    }
    if (period.id === input.id) {
      sheet.getRange(index + 2, 4).setValue(status);
    }
  });
  return { ok: true };
}

function buildExportSheet(periodId) {
  setupMvp();
  const dashboard = getDashboardData({ periodId: periodId });
  const ss = SpreadsheetApp.getActive();
  const sheet = ensureSheet_(ss, SHEETS.export, [
    "Период",
    "Кто оценивает",
    "Кого оценивают",
    "Оценка",
    "Комментарий",
    "Автор",
    "Дата"
  ]);
  sheet.clear();
  sheet.appendRow(["Период", "Кто оценивает", "Кого оценивают", "Оценка", "Комментарий", "Автор", "Дата"]);

  const label = dashboard.selectedPeriod
    ? monthLabel_(dashboard.selectedPeriod.month) + " " + dashboard.selectedPeriod.year
    : "";
  dashboard.matrixEvaluations.forEach(function (evaluation) {
    sheet.appendRow([
      label,
      evaluation.evaluatorDepartmentName,
      evaluation.evaluateeDepartmentName,
      evaluation.score,
      evaluation.comment || "",
      evaluation.authorEmail,
      evaluation.createdAt
    ]);
  });
  sheet.autoResizeColumns(1, 7);
  return { ok: true };
}

function getReferenceData_() {
  return {
    departments: getRows_("departments").filter(active_),
    users: getRows_("users").filter(active_),
    periods: getRows_("periods")
      .sort(function (a, b) {
        return Number(b.year) - Number(a.year) || Number(b.month) - Number(a.month);
      }),
    criteria: getRows_("criteria").filter(active_)
  };
}

function emptyDashboard_(data, selectedPeriod) {
  return {
    selectedPeriod: selectedPeriod || null,
    departments: data.departments,
    periods: data.periods,
    criteria: data.criteria,
    evaluations: [],
    matrixEvaluations: [],
    byEvaluatee: [],
    byEvaluator: [],
    companyAverage: null,
    lowScores: [],
    expectedCount: 0,
    missingCount: 0,
    completion: [],
    dynamics: []
  };
}

function enrichEvaluation_(evaluation, data) {
  const evaluator = data.departments.find(function (department) {
    return department.id === evaluation.evaluatorDepartmentId;
  });
  const evaluatee = data.departments.find(function (department) {
    return department.id === evaluation.evaluateeDepartmentId;
  });
  return Object.assign({}, evaluation, {
    score: Number(evaluation.score),
    evaluatorDepartmentName: evaluator ? evaluator.name : "Не найдено",
    evaluateeDepartmentName: evaluatee ? evaluatee.name : "Не найдено",
    evaluatorShortName: evaluator ? evaluator.shortName : "",
    evaluateeShortName: evaluatee ? evaluatee.shortName : ""
  });
}

function requireAdmin_(emailOverride) {
  const user = getCurrentUser_(emailOverride);
  if (!user || user.role !== ROLE.ADMIN) {
    throw new Error("Доступно только администратору.");
  }
  return user;
}

function getCurrentUser_(emailOverride) {
  const email = String(getSessionEmail_() || emailOverride || "").trim().toLowerCase();
  if (!email) return null;
  return getRows_("users").find(function (user) {
    return active_(user) && String(user.email).toLowerCase() === email;
  }) || null;
}

function getSessionEmail_() {
  try {
    return Session.getActiveUser().getEmail();
  } catch (error) {
    return "";
  }
}

function ensureSheet_(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const needsHeaders = currentHeaders.join("") === "" || currentHeaders.join("|") !== headers.join("|");
  if (needsHeaders) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getSheet_(key) {
  return SpreadsheetApp.getActive().getSheetByName(SHEETS[key]);
}

function getRows_(key) {
  const sheet = getSheet_(key);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const headers = HEADERS[key];
  return sheet
    .getRange(2, 1, sheet.getLastRow() - 1, headers.length)
    .getValues()
    .filter(function (row) {
      return row.join("") !== "";
    })
    .map(function (row) {
      const object = {};
      headers.forEach(function (header, index) {
        object[header] = row[index];
      });
      return object;
    });
}

function upsertByName_(key, name, row) {
  const sheet = getSheet_(key);
  const rows = getRows_(key);
  const existingIndex = rows.findIndex(function (item) {
    return String(item.name).toLowerCase() === name.toLowerCase();
  });
  if (existingIndex >= 0) {
    row[0] = rows[existingIndex].id;
    sheet.getRange(existingIndex + 2, 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
}

function upsertByEmail_(key, email, row) {
  const sheet = getSheet_(key);
  const rows = getRows_(key);
  const existingIndex = rows.findIndex(function (item) {
    return String(item.email).toLowerCase() === email.toLowerCase();
  });
  if (existingIndex >= 0) {
    row[0] = rows[existingIndex].id;
    sheet.getRange(existingIndex + 2, 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
}

function softDelete_(key, id) {
  const sheet = getSheet_(key);
  const rows = getRows_(key);
  const index = rows.findIndex(function (item) {
    return item.id === id;
  });
  if (index >= 0) {
    sheet.getRange(index + 2, HEADERS[key].indexOf("isActive") + 1).setValue(false);
  }
}

function active_(row) {
  return row.isActive === true || row.isActive === "TRUE" || row.isActive === "true";
}

function average_(values) {
  const valid = values.filter(function (value) {
    return !isNaN(Number(value));
  });
  if (!valid.length) return null;
  return valid.reduce(function (sum, value) {
    return sum + Number(value);
  }, 0) / valid.length;
}

function makeId_(prefix) {
  return prefix + "_" + Utilities.getUuid().slice(0, 8);
}

function monthLabel_(month) {
  return [
    "Январь",
    "Февраль",
    "Март",
    "Апрель",
    "Май",
    "Июнь",
    "Июль",
    "Август",
    "Сентябрь",
    "Октябрь",
    "Ноябрь",
    "Декабрь"
  ][Number(month) - 1];
}

function seedMvp_() {
  const departmentRows = getRows_("departments");
  const userRows = getRows_("users");
  const criterionRows = getRows_("criteria");
  const periodRows = getRows_("periods");

  if (!departmentRows.length) {
    [
      ["Продажи", "Sales"],
      ["Маркетинг", "Mkt"],
      ["Финансы", "Fin"],
      ["HR", "HR"],
      ["IT", "IT"],
      ["Операции", "Ops"]
    ].forEach(function (item) {
      getSheet_("departments").appendRow([makeId_("dep"), item[0], item[1], true]);
    });
  }

  const departments = getRows_("departments");
  function depId(name) {
    const dep = departments.find(function (item) {
      return item.name === name;
    });
    return dep ? dep.id : "";
  }

  if (!userRows.length) {
    [
      ["Администратор", "admin@company.test", ROLE.ADMIN, ""],
      ["Аналитик", "viewer@company.test", ROLE.VIEWER, ""],
      ["Анна Смирнова", "anna@company.test", ROLE.LEADER, depId("Продажи")],
      ["Илья Орлов", "ilya@company.test", ROLE.LEADER, depId("Маркетинг")],
      ["Ольга Захарова", "olga@company.test", ROLE.LEADER, depId("Финансы")],
      ["Дина Ахметова", "dina@company.test", ROLE.LEADER, depId("HR")],
      ["Роман Ким", "roman@company.test", ROLE.LEADER, depId("IT")],
      ["Максим Волков", "maxim@company.test", ROLE.LEADER, depId("Операции")]
    ].forEach(function (item) {
      getSheet_("users").appendRow([makeId_("usr"), item[0], item[1], item[2], item[3], true]);
    });
  }

  if (!criterionRows.length) {
    [
      ["Общая оценка взаимодействия", "Сводная оценка коммуникации, сроков и результата"],
      ["Скорость реакции", "Насколько быстро подразделение отвечает на запросы"],
      ["Качество результата", "Насколько результат соответствует ожиданиям"]
    ].forEach(function (item) {
      getSheet_("criteria").appendRow([makeId_("crit"), item[0], item[1], true]);
    });
  }

  if (!periodRows.length) {
    [
      [3, 2026, PERIOD_STATUS.CLOSED],
      [4, 2026, PERIOD_STATUS.CLOSED],
      [5, 2026, PERIOD_STATUS.OPEN]
    ].forEach(function (item) {
      getSheet_("periods").appendRow([makeId_("per"), item[0], item[1], item[2], new Date()]);
    });
  }

  if (getRows_("evaluations").length) return;

  const refreshed = getReferenceData_();
  const generalCriterion = refreshed.criteria.find(function (criterion) {
    return criterion.name === "Общая оценка взаимодействия";
  });
  const users = getRows_("users");
  const comments = [
    "Задержки в согласовании документов, нужен единый SLA по ответам.",
    "Запросы часто возвращаются без владельца задачи.",
    "Не хватило прозрачности по срокам выполнения.",
    "Коммуникация стала лучше, но по срочным вопросам пока есть разрывы."
  ];

  refreshed.periods.forEach(function (period) {
    let counter = 0;
    refreshed.departments.forEach(function (evaluator) {
      refreshed.departments.forEach(function (evaluatee) {
        if (evaluator.id === evaluatee.id) return;
        if (period.status === PERIOD_STATUS.OPEN && evaluator.name === "HR" && ["IT", "Операции"].indexOf(evaluatee.name) >= 0) {
          return;
        }
        const score = Math.min(10, 7 + ((evaluator.name.length + evaluatee.name.length + Number(period.month) + counter) % 4));
        const author = users.find(function (user) {
          return user.departmentId === evaluator.id;
        });
        getSheet_("evaluations").appendRow([
          makeId_("eval"),
          period.id,
          evaluator.id,
          evaluatee.id,
          generalCriterion.id,
          score,
          score < 9 ? comments[counter % comments.length] : "",
          new Date(),
          author ? author.email : "admin@company.test"
        ]);
        counter += 1;
      });
    });
  });
}
