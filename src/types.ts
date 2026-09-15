export type QuestionType = "factual" | "conceptual" | "debug";
export type StudentProgress = "close" | "off_track" | "no_attempt";
export type Mode = "ask" | "debug";

export type ResponseSection = {
  label?: string;
  text?: string;
  code?: string;
  codeLang?: string;
};

export type TutorResponse = {
  sections: ResponseSection[];
  questionType: QuestionType;
  studentProgress: StudentProgress;
  guidanceLevel: number;
};

export type Usage = { used: number; limit: number };

export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  isGuest?: boolean;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
