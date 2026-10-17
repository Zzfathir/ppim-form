import type { TemplateQuestion } from "../../src/lib/questions";

/**
 * Starter templates modelled on Google Forms' own (build prompt §12).
 * `category` is matched by name against the seeded categories.
 */
export const TEMPLATES: { title: string; description: string; category: string; questions: TemplateQuestion[] }[] = [
  {
    title: "Contact information",
    description: "Collect names and ways to get in touch.",
    category: "Data collection",
    questions: [
      { type: "short_text", title: "Name", required: true },
      { type: "short_text", title: "Email", required: true },
      { type: "short_text", title: "Phone number (WhatsApp)", required: false },
      { type: "paragraph", title: "Comments", required: false },
    ],
  },
  {
    title: "Event registration",
    description: "Register participants for an event.",
    category: "Event registration",
    questions: [
      { type: "short_text", title: "Full name", required: true },
      { type: "short_text", title: "Email or WhatsApp number", required: true },
      { type: "short_text", title: "Department / faculty", required: false },
      {
        type: "single_choice",
        title: "How will you attend?",
        required: true,
        options: ["In person", "Online"],
      },
    ],
  },
  {
    title: "RSVP",
    description: "Find out who is coming.",
    category: "Event registration",
    questions: [
      { type: "short_text", title: "Name", required: true },
      { type: "single_choice", title: "Can you attend?", required: true, options: ["Yes", "No", "Maybe"] },
      { type: "dropdown", title: "Number of guests", required: false, options: ["0", "1", "2", "3", "4", "5"] },
      { type: "paragraph", title: "Notes", required: false },
    ],
  },
  {
    title: "Event feedback",
    description: "Ask participants how the event went.",
    category: "Feedback / evaluation",
    questions: [
      {
        type: "scale",
        title: "Overall, how satisfied were you with the event?",
        required: true,
        settings: { min: 1, max: 5, min_label: "Not satisfied", max_label: "Very satisfied" },
      },
      {
        type: "scale",
        title: "How useful was the content?",
        required: true,
        settings: { min: 1, max: 5, min_label: "Not useful", max_label: "Very useful" },
      },
      {
        type: "scale",
        title: "How well was the event organised?",
        required: true,
        settings: { min: 1, max: 5, min_label: "Poorly", max_label: "Very well" },
      },
      { type: "paragraph", title: "What did you like most?", required: false },
      { type: "paragraph", title: "What could we improve?", required: false },
    ],
  },
  {
    title: "Attendance",
    description: "Record who attended a session.",
    category: "Attendance",
    questions: [
      { type: "short_text", title: "Name", required: true },
      { type: "dropdown", title: "Session", required: true, options: ["Session 1", "Session 2"] },
    ],
  },
  {
    title: "Simple survey",
    description: "A short survey with one choice question and one open question.",
    category: "Survey",
    questions: [
      {
        type: "single_choice",
        title: "How often do you join PPI activities?",
        required: true,
        options: ["Every month", "A few times a year", "Rarely", "This is my first time"],
        settings: { allow_other: true },
      },
      { type: "paragraph", title: "Anything else you'd like to tell us?", required: false },
    ],
  },
  {
    title: "Poll / voting",
    description: "Let members vote on a single question.",
    category: "Poll / voting",
    questions: [
      { type: "single_choice", title: "Which option do you choose?", required: true, options: ["Option 1", "Option 2", "Option 3"] },
    ],
  },
  {
    title: "Member data collection",
    description: "Collect basic data about members.",
    category: "Data collection",
    questions: [
      { type: "short_text", title: "Full name", required: true },
      { type: "short_text", title: "University", required: true },
      { type: "short_text", title: "City", required: true },
      { type: "short_text", title: "Contact (WhatsApp or email)", required: true },
    ],
  },
];
