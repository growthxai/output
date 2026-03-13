import { verify, Verdict, judgeVerdict, judgeScore, judgeLabel } from '@outputai/evals';
import { z } from '@outputai/core';

const blogInput = z.object( { topic: z.string() } );
const blogOutput = z.object( { title: z.string(), blog_post: z.string() } );

export const lengthOfOutput = verify(
  { name: 'length_of_output', input: blogInput, output: blogOutput },
  ( { output, context } ) =>
    Verdict.gte( output.blog_post.length, Number( context.ground_truth.min_length ?? 100 ) )
);

export const evaluateContent = verify(
  { name: 'evaluate_content', input: blogInput, output: blogOutput },
  ( { output, context } ) => {
    const required = String( context.ground_truth.required_content ?? '' );
    if ( !required ) {
      return Verdict.isTrue( true );
    }
    return Verdict.contains( output.blog_post, required );
  }
);

export const evaluateTopic = verify(
  { name: 'evaluate_topic', input: blogInput, output: blogOutput },
  async ( { input, output, context } ) =>
    judgeVerdict( {
      prompt: 'judge_topic@v1',
      variables: {
        blog_title: output.title,
        blog_post: output.blog_post,
        required_topic: String( context.ground_truth.required_topic ?? input.topic )
      }
    } )
);

export const evaluateQuality = verify(
  { name: 'evaluate_quality', input: blogInput, output: blogOutput },
  async ( { input, output } ) =>
    judgeScore( {
      prompt: 'judge_quality@v1',
      variables: {
        blog_title: output.title,
        blog_post: output.blog_post,
        topic: input.topic
      }
    } )
);

export const evaluateTone = verify(
  { name: 'evaluate_tone', input: blogInput, output: blogOutput },
  async ( { output } ) =>
    judgeLabel( {
      prompt: 'judge_tone@v1',
      variables: {
        blog_title: output.title,
        blog_post: output.blog_post
      }
    } )
);
