import { orderBy } from "lodash-es";
import slug from "slug";

import { ComposedDatabase, UNKNOWN_ID } from "@/types";
import { Policy } from "@/types/proto/v1/org_policy_service";
import { User } from "@/types/proto/v1/auth_service";
import {
  hasFeature,
  useCurrentUserIamPolicy,
  usePolicyV1Store,
  useSubscriptionV1Store,
} from "@/store";
import { hasWorkspacePermissionV1 } from "../role";
import { Engine, State } from "@/types/proto/v1/common";
import { isDev, semverCompare } from "../util";
import { DataSourceType } from "@/types/proto/v1/instance_service";
import { Expr } from "@/types/proto/google/api/expr/v1alpha1/syntax";
import { SimpleExpr, resolveCELExpr } from "@/plugins/cel";

export const databaseV1Slug = (db: ComposedDatabase) => {
  return [slug(db.databaseName), db.uid].join("-");
};

export const extractDatabaseResourceName = (
  resource: string
): {
  instance: string;
  database: string;
} => {
  const pattern =
    /(?:^|\/)instances\/(?<instance>[^/]+)\/databases\/(?<database>[^/]+)(?:$|\/)/;
  const matches = resource.match(pattern);
  if (matches) {
    const { instance = String(UNKNOWN_ID), database = "" } =
      matches.groups ?? {};
    return {
      instance,
      database,
    };
  }
  return {
    instance: String(UNKNOWN_ID),
    database: "",
  };
};

export const sortDatabaseV1List = (databaseList: ComposedDatabase[]) => {
  return orderBy(
    databaseList,
    [
      (db) => db.instanceEntity.environmentEntity.order,
      (db) => Number(db.instanceEntity.uid),
      (db) => Number(db.projectEntity.uid),
      (db) => db.databaseName,
    ],
    ["desc", "asc", "asc", "asc"]
  );
};

export const isPITRDatabaseV1 = (db: ComposedDatabase): boolean => {
  // A pitr database's name is xxx_pitr_1234567890 or xxx_pitr_1234567890_del
  return !!db.databaseName.match(/^(.+?)_pitr_(\d+)(_del)?$/);
};

export const isArchivedDatabaseV1 = (db: ComposedDatabase): boolean => {
  if (db.instanceEntity.state === State.DELETED) {
    return true;
  }
  if (db.instanceEntity.environmentEntity.state === State.DELETED) {
    return true;
  }
  return false;
};
export const isDatabaseV1Accessible = (
  database: ComposedDatabase,
  policyList: Policy[],
  user: User
): boolean => {
  if (!hasFeature("bb.feature.access-control")) {
    // The current plan doesn't have access control feature.
    // Fallback to true.
    return true;
  }

  if (
    hasWorkspacePermissionV1(
      "bb.permission.workspace.manage-access-control",
      user.userRole
    )
  ) {
    // The current user has the super privilege to access all databases.
    // AKA. Owners and DBAs
    return true;
  }

  const policy = usePolicyV1Store().getPolicyByName("policies/WORKSPACE_IAM");
  if (policy) {
    const bindings = policy.workspaceIamPolicy?.bindings;
    if (bindings) {
      const querierBinding = bindings.find(
        (binding) => binding.role === "roles/QUERIER"
      );
      if (querierBinding) {
        const simpleExpr = resolveCELExpr(
          querierBinding.parsedExpr?.expr || Expr.fromPartial({})
        );
        const envNameList = extractEnvironmentNameListFromExpr(simpleExpr);
        if (envNameList.includes(database.instanceEntity.environment)) {
          return true;
        }
      }
    }
  }

  const currentUserIamPolicy = useCurrentUserIamPolicy();
  if (currentUserIamPolicy.allowToQueryDatabaseV1(database)) {
    return true;
  }

  // denied otherwise
  return false;
};

type DatabaseV1FilterFields =
  | "name"
  | "project"
  | "instance"
  | "environment"
  | "tenant";
export function filterDatabaseV1ByKeyword(
  db: ComposedDatabase,
  keyword: string,
  columns: DatabaseV1FilterFields[] = ["name"]
): boolean {
  keyword = keyword.trim().toLowerCase();
  if (!keyword) {
    // Skip the filter
    return true;
  }

  if (
    columns.includes("name") &&
    db.databaseName.toLowerCase().includes(keyword)
  ) {
    return true;
  }

  if (
    columns.includes("project") &&
    db.projectEntity.title.toLowerCase().includes(keyword)
  ) {
    return true;
  }

  if (
    columns.includes("instance") &&
    db.instanceEntity.title.toLowerCase().includes(keyword)
  ) {
    return true;
  }

  if (
    columns.includes("environment") &&
    db.instanceEntity.environmentEntity.title.toLowerCase().includes(keyword)
  ) {
    return true;
  }

  if (columns.includes("tenant")) {
    const tenantValue = db.labels["bb.tenant"] ?? "";
    if (tenantValue.toLowerCase().includes(keyword)) {
      return true;
    }
  }

  return false;
}

const MIN_GHOST_SUPPORT_MYSQL_VERSION = "5.7.0";

export function allowGhostMigrationV1(
  databaseList: ComposedDatabase[]
): boolean {
  const subscriptionV1Store = useSubscriptionV1Store();
  return databaseList.every((db) => {
    return (
      db.instanceEntity.engine === Engine.MYSQL &&
      subscriptionV1Store.hasInstanceFeature(
        "bb.feature.online-migration",
        db.instanceEntity
      ) &&
      semverCompare(
        db.instanceEntity.engineVersion,
        MIN_GHOST_SUPPORT_MYSQL_VERSION,
        "gte"
      )
    );
  });
}

export function allowDatabaseV1Access(
  database: ComposedDatabase,
  user: User,
  type: DataSourceType
): boolean {
  // "ADMIN" data source should only be used by the system, thus it shouldn't
  // touch this method at all. If it touches somehow, we will reject it and
  // log a warning
  if (type === DataSourceType.ADMIN) {
    if (isDev()) {
      console.trace(
        "Should not check database access against ADMIN connection"
      );
    } else {
      console.warn("Should not check database access against ADMIN connection");
    }
    return false;
  }

  if (
    hasWorkspacePermissionV1(
      "bb.permission.workspace.manage-instance",
      user.userRole
    )
  ) {
    return true;
  }

  return false;
}

export const extractEnvironmentNameListFromExpr = (
  expr: SimpleExpr
): string[] => {
  const [left, right] = expr.args;
  if (expr.operator === "@in" && left === "resource.environment_name") {
    return right as any as string[];
  }
  return [];
};
