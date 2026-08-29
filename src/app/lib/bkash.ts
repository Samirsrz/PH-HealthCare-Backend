import config from "../config";
import { redisClient } from "./redis";

export const getBkashIdToken = async () => {
  try {
    const idTokenKey = "bkash:idToken";
    const refreshTokenKey = "bkash:refreshToken";

    let bkashIdToken = await redisClient.get(idTokenKey);
    const bkashRefreshToken = await redisClient.get(refreshTokenKey);
  
    const bkashIdTokenTTL = await redisClient.ttl(idTokenKey);
    const bkashRefreshTokenTTL = await redisClient.ttl(refreshTokenKey)


    //  console.log({
    //     bkashIdToken,bkashRefreshToken, bkashIdTokenTTL,bkashRefreshTokenTTL
    //  });

// bkash idToken remaining but time is less than 10minutes or bkash idToken is expired
// bkash refresh token must exist
// bkash refreshToken remaining time is more than 10minutes

// 2nd---------------------------------------------------------------
    if ((bkashIdTokenTTL <= 600 || !bkashIdToken) && bkashRefreshToken && bkashRefreshTokenTTL > 600 ) {
      
      const refreshTokenResponse = await fetch(
        `${config.bkash_base_url}/tokenized/checkout/token/refresh`,
        {
          method: "POST",
          headers: {
            ContentType: "application/json",
            Accept: "application/json",
            username: config.bkash_username,
            password: config.bkash_password,
          },
          body: JSON.stringify({
            app_key: config.bkash_app_key,
            app_secret: config.bkash_app_secret,
            refresh_token: bkashRefreshToken,
          }),
        },
      );

     if (!refreshTokenResponse.ok) {
      throw new Error("Bkash Access Token Failed");
    }

      const bkashRefreshTokenResult = await refreshTokenResponse.json();

      bkashIdToken = bkashRefreshTokenResult.id_token as string;
      await redisClient.set(idTokenKey, bkashIdToken, {
        expiration: {
          type: "EX",
          value: 60 * 60,
        },
      });
      return bkashIdToken;
    }

    if (bkashIdTokenTTL > 600) {
      return bkashIdToken;
    }
// ---------------------------------------2nd end


    // 1st -------------------
    const response = await fetch(
      `${config.bkash_base_url}/tokenized/checkout/token/grant`,
      {
        method: "POST",
        headers: {
          ContentType: "application/json",
          Accept: "application/json",
          username: config.bkash_username,
          password: config.bkash_password,
        },
        body: JSON.stringify({
          app_key: config.bkash_app_key,
          app_secret: config.bkash_app_secret,
        }),
      },
    );

    if (!response.ok) {
      throw new Error("Bkash Access Token Failed");
    }
    const result = await response.json();

    //bkash idToken set in REDIS
    await redisClient.set(idTokenKey, result.id_token, {
      expiration: {
        type: "EX",
        value: 60 * 60,
      },
    });

    // bkash refresh token
    await redisClient.set(refreshTokenKey, result.refresh_token, {
      expiration: {
        type: "EX",
        value: 60 * 60 * 24 * 28, //28days
      },
    });

    bkashIdToken = result.id_token;

    return result.id_token;
    // ------------------------------------------------------------------------1st end
  } catch (error: any) {
    throw new Error(error.message);
  }
};