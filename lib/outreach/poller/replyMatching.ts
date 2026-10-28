export interface ActiveEnrollmentContact {
  enrollmentId: string;
  contactEmail: string;
}

/** Given the set of sender addresses (any case) that mailed the inbox since
 * the last poll, returns which enrollments' contacts sent one - i.e. which
 * enrollments should be marked as replied. */
export function matchReplies(
  enrollments: ActiveEnrollmentContact[],
  repliedFromAddresses: Set<string>,
): string[] {
  const lowercased = new Set([...repliedFromAddresses].map((address) => address.toLowerCase()));
  return enrollments
    .filter((enrollment) => lowercased.has(enrollment.contactEmail.toLowerCase()))
    .map((enrollment) => enrollment.enrollmentId);
}
