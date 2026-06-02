export enum MoodleFunction {
  // Core
  GetSiteInfo         = 'core_webservice_get_site_info',
  InvalidateTokens    = 'core_auth_invalidate_tokens',
  GetUserCourses      = 'core_enrol_get_users_courses',
  // Assignments
  GetAssignments      = 'mod_assign_get_assignments',
  GetGradeItems       = 'gradereport_user_get_grade_items',
  GetSubmissionStatus = 'mod_assign_get_submission_status',
  // Submissions
  GetUnusedDraftItemId = 'core_files_get_unused_draft_itemid',
  SaveSubmission       = 'mod_assign_save_submission',
  SubmitForGrading     = 'mod_assign_submit_for_grading',
  RemoveSubmission     = 'mod_assign_remove_submission',
  // Quizzes
  GetQuizzesByCourses = 'mod_quiz_get_quizzes_by_courses',
  GetUserAttempts     = 'mod_quiz_get_user_attempts',
  GetUserBestGrade    = 'mod_quiz_get_user_best_grade',
  StartAttempt        = 'mod_quiz_start_attempt',
  GetAttemptSummary   = 'mod_quiz_get_attempt_summary',
  SaveAttempt         = 'mod_quiz_save_attempt',
  ProcessAttempt      = 'mod_quiz_process_attempt',
  ViewQuiz            = 'mod_quiz_view_quiz',
}
