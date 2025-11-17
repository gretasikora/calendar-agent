/**
 * Shared utility for building label mutations from convenience flags
 */

export interface LabelMutationFlags {
  addLabelIds?: string[];
  removeLabelIds?: string[];
  markAsRead?: boolean;
  markAsUnread?: boolean;
  star?: boolean;
  unstar?: boolean;
  markAsImportant?: boolean;
  markAsNotImportant?: boolean;
  archive?: boolean;
  unarchive?: boolean;
}

export interface LabelMutation {
  addLabelIds: string[];
  removeLabelIds: string[];
}

export class LabelMutationBuilder {
  /**
   * Validates mutually exclusive flags
   */
  static validate(flags: LabelMutationFlags): void {
    const conflicts: Array<[string, string]> = [
      ['markAsRead', 'markAsUnread'],
      ['star', 'unstar'],
      ['markAsImportant', 'markAsNotImportant'],
      ['archive', 'unarchive']
    ];

    for (const [flag1, flag2] of conflicts) {
      if (flags[flag1 as keyof LabelMutationFlags] && flags[flag2 as keyof LabelMutationFlags]) {
        throw new Error(`Conflicting flags: cannot set both ${flag1} and ${flag2}`);
      }
    }
  }

  /**
   * Builds label mutations from convenience flags
   */
  static build(flags: LabelMutationFlags): LabelMutation {
    // Validate first
    this.validate(flags);

    const addLabelIds: string[] = [...(flags.addLabelIds || [])];
    const removeLabelIds: string[] = [...(flags.removeLabelIds || [])];

    // Handle convenience flags
    if (flags.markAsRead) {
      removeLabelIds.push('UNREAD');
    }
    if (flags.markAsUnread) {
      addLabelIds.push('UNREAD');
    }
    if (flags.star) {
      addLabelIds.push('STARRED');
    }
    if (flags.unstar) {
      removeLabelIds.push('STARRED');
    }
    if (flags.markAsImportant) {
      addLabelIds.push('IMPORTANT');
    }
    if (flags.markAsNotImportant) {
      removeLabelIds.push('IMPORTANT');
    }
    if (flags.archive) {
      removeLabelIds.push('INBOX');
    }
    if (flags.unarchive) {
      addLabelIds.push('INBOX');
    }

    // Remove duplicates
    const uniqueAddLabelIds = [...new Set(addLabelIds)];
    const uniqueRemoveLabelIds = [...new Set(removeLabelIds)];

    // Remove any labels that appear in both lists
    const finalAddLabelIds = uniqueAddLabelIds.filter(id => !uniqueRemoveLabelIds.includes(id));
    const finalRemoveLabelIds = uniqueRemoveLabelIds.filter(id => !uniqueAddLabelIds.includes(id));

    return {
      addLabelIds: finalAddLabelIds,
      removeLabelIds: finalRemoveLabelIds
    };
  }

  /**
   * Checks if a message can have its labels modified based on its current labels
   * Gmail blocks most label operations on TRASH/SPAM messages
   */
  static canModifyLabels(currentLabels: string[], mutation: LabelMutation): boolean {
    const isInTrash = currentLabels.includes('TRASH');
    const isInSpam = currentLabels.includes('SPAM');
    
    // If in TRASH or SPAM, only untrash/unspam operations are allowed
    if (isInTrash || isInSpam) {
      // Check if trying to remove TRASH or SPAM (untrash/unspam)
      const removingTrash = mutation.removeLabelIds.includes('TRASH');
      const removingSpam = mutation.removeLabelIds.includes('SPAM');
      
      // If only removing TRASH/SPAM, that's allowed
      if (removingTrash || removingSpam) {
        return true;
      }
      
      // Any other label operation on TRASH/SPAM is blocked
      return false;
    }
    
    return true;
  }
}