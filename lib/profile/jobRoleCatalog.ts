export const JOB_ROLE_GROUPS = [
  {
    label: "Engineering",
    options: [
      "Software Engineer",
      "Frontend Engineer",
      "Backend Engineer",
      "Full Stack Engineer",
      "DevOps Engineer",
      "QA Engineer",
      "Security Engineer",
    ],
  },
  {
    label: "Data",
    options: [
      "Data Analyst",
      "Business Analyst",
      "Data Scientist",
      "Data Engineer",
      "Analytics Manager",
    ],
  },
  {
    label: "Product",
    options: [
      "Product Manager",
      "Technical Product Manager",
      "Product Owner",
      "Program Manager",
      "Project Manager",
    ],
  },
  {
    label: "Design",
    options: [
      "UX Designer",
      "UI Designer",
      "Product Designer",
      "Graphic Designer",
      "Content Designer",
    ],
  },
  {
    label: "Sales",
    options: [
      "Sales Manager",
      "Account Executive",
      "Business Development Manager",
      "Sales Development Representative",
      "Customer Success Manager",
    ],
  },
  {
    label: "Marketing",
    options: [
      "Marketing Manager",
      "Growth Marketing Manager",
      "Content Strategist",
      "SEO Specialist",
      "Brand Manager",
    ],
  },
  {
    label: "Operations",
    options: [
      "Operations Manager",
      "Business Operations Manager",
      "Operations Analyst",
      "Supply Chain Manager",
      "Logistics Coordinator",
    ],
  },
  {
    label: "Finance",
    options: [
      "Finance Manager",
      "Financial Analyst",
      "Accountant",
      "FP&A Manager",
      "Controller",
    ],
  },
  {
    label: "People & Talent",
    options: [
      "Recruiter",
      "Talent Acquisition Specialist",
      "HR Manager",
      "People Operations Manager",
      "Training Manager",
    ],
  },
  {
    label: "Healthcare",
    options: [
      "Healthcare Administrator",
      "Clinical Operations Manager",
      "Nurse Manager",
      "Medical Assistant",
      "Patient Success Coordinator",
    ],
  },
  {
    label: "Education & Nonprofit",
    options: [
      "Education Program Manager",
      "Instructional Designer",
      "Admissions Counselor",
      "Nonprofit Operations Manager",
      "Community Outreach Manager",
    ],
  },
  {
    label: "Legal & Compliance",
    options: [
      "Compliance Manager",
      "Legal Operations Manager",
      "Contract Manager",
      "Risk Analyst",
      "Policy Analyst",
    ],
  },
  {
    label: "General",
    options: ["Administrative Assistant", "Executive Assistant", "Office Manager", "Other / Generalist"],
  },
] as const;

export const ALL_JOB_ROLE_OPTIONS = JOB_ROLE_GROUPS.flatMap((group) => group.options);

export function isKnownJobRole(value: string): boolean {
  return ALL_JOB_ROLE_OPTIONS.includes(value as (typeof ALL_JOB_ROLE_OPTIONS)[number]);
}